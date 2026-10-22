import { randomBytes, randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { configureIdp, getMyIdp } from "../../src/admin/sso";
import { IDP_SECRET_FIELD, loadTenantIdp } from "../../src/auth/idp";
import { loginIdentity, newSessionToken } from "../../src/auth/session";
import { decrypt, encrypt, LocalKeyProvider } from "../../src/crypto/fieldCrypto";
import { connect, withTenant, type Sql } from "../../src/db/client";
import { dbEnabled, urls } from "./urls";

const keys = new LocalKeyProvider(randomBytes(32));
const SECRET_A = "client-secret-for-acme-0123456789"; // secret-scan:allow (synthetic test value)

describe.skipIf(!dbEnabled)("per-tenant single sign-on (real Postgres)", () => {
  let owner: Sql, app: Sql;
  const T: Record<string, string> = {}, ADMIN: Record<string, string> = {}, VIEW: Record<string, string> = {}, SLUG: Record<string, string> = {};
  const ISS = (tag: string) => `https://login.${tag}.example.test`;

  async function provision(tag: string, opts: { configured: boolean; enabled?: boolean }): Promise<void> {
    const tenant = randomUUID(); T[tag] = tenant; SLUG[tag] = `${tag}-${tenant.slice(0, 6)}`;
    const enc = opts.configured ? await encrypt(keys, tenant, IDP_SECRET_FIELD, Buffer.from(SECRET_A)) : null;
    await withTenant(owner, { tenantId: tenant }, async (tx) => {
      await tx`insert into tenants (id, name) values (${tenant}, ${tag})`;
      const [a] = await tx<{ id: string }[]>`insert into users (tenant_id, email, role) values (${tenant}, ${`${tag}-admin@example.test`}, 'admin') returning id`;
      const [v] = await tx<{ id: string }[]>`insert into users (tenant_id, email, role) values (${tenant}, ${`${tag}-viewer@example.test`}, 'viewer') returning id`;
      ADMIN[tag] = a!.id; VIEW[tag] = v!.id;
      await tx`insert into auth.tenant_idps (tenant_id, slug, issuer, client_id, client_secret_enc, required_amr, enabled)
               values (${tenant}, ${SLUG[tag]!}, ${opts.configured ? ISS(tag) : null}, ${opts.configured ? `client-${tag}` : null}, ${enc}, ${opts.configured ? ["mfa"] : []}, ${opts.enabled ?? opts.configured})`;
      if (opts.configured) { await tx`insert into auth.identities (tenant_id, user_id, issuer, subject) values (${tenant}, ${a!.id}, ${ISS(tag)}, 'sub-admin')`; await tx`insert into auth.identities (tenant_id, user_id, issuer, subject) values (${tenant}, ${v!.id}, ${ISS(tag)}, 'sub-viewer')`; }
    });
  }
  const as = <R>(tag: string, who: "admin" | "viewer", fn: (tx: Parameters<Parameters<typeof withTenant>[2]>[0]) => Promise<R>) =>
    withTenant(app, { tenantId: T[tag]!, userId: who === "admin" ? ADMIN[tag]! : VIEW[tag]! }, fn as never) as Promise<R>;

  beforeAll(async () => {
    owner = connect(urls.owner()); app = connect(urls.app());
    await provision("acme", { configured: true });
    await provision("beta", { configured: true });
    await provision("gamma", { configured: false });
    await provision("delta", { configured: true, enabled: false });
  });
  afterAll(async () => { await Promise.all([owner.end(), app.end()]); });

  describe("finding an organization's provider before sign-in", () => {
    it("returns the enabled, configured provider with the secret decryptable only under that tenant", async () => {
      const c = await loadTenantIdp(app, keys, SLUG["acme"]!, "https://app.example.test/api/auth/callback");
      expect(c).toMatchObject({ tenantId: T["acme"], issuer: ISS("acme"), clientId: "client-acme", clientSecret: SECRET_A, requiredAmr: ["mfa"] });
    });
    it("is case-insensitive about the name", async () => expect((await loadTenantIdp(app, keys, SLUG["acme"]!.toUpperCase(), "https://x.test/cb"))?.tenantId).toBe(T["acme"]));
    it("says nothing for an unknown name, a disabled provider, an unconfigured organization or a malformed name", async () => {
      for (const s of ["no-such-org", SLUG["delta"]!, SLUG["gamma"]!, "x", "Bad Name!", "../etc"]) expect(await loadTenantIdp(app, keys, s, "https://x.test/cb"), s).toBeNull();
    });
    it("a ciphertext cannot be moved to another tenant (it is bound to its tenant)", async () => {
      const [r] = await owner<{ client_secret_enc: Buffer }[]>`select client_secret_enc from auth.tenant_idps where tenant_id = ${T["acme"]!}`;
      expect((await decrypt(keys, T["acme"]!, IDP_SECRET_FIELD, r!.client_secret_enc)).toString()).toBe(SECRET_A);
      await expect(decrypt(keys, T["beta"]!, IDP_SECRET_FIELD, r!.client_secret_enc)).rejects.toThrow();
      await expect(decrypt(keys, T["acme"]!, "other_field", r!.client_secret_enc)).rejects.toThrow();
    });
    it("the application role cannot read the table, and the stored secret is not plaintext", async () => {
      await expect(app`select * from auth.tenant_idps`).rejects.toThrow(/permission denied/);
      const [r] = await owner<{ client_secret_enc: Buffer }[]>`select client_secret_enc from auth.tenant_idps where tenant_id = ${T["acme"]!}`;
      expect(r!.client_secret_enc.toString("utf8")).not.toContain("client-secret");
    });
  });

  describe("administering your own provider", () => {
    it("an admin sees their settings, never the secret", async () => {
      const me = await getMyIdp(app, { tenantId: T["acme"]!, userId: ADMIN["acme"]! });
      expect(me).toMatchObject({ slug: SLUG["acme"], issuer: ISS("acme"), client_id: "client-acme", has_secret: true, enabled: true });
      expect(JSON.stringify(me)).not.toContain("client-secret");
    });
    it("a non-admin cannot read or change them; other tenants' settings are not visible", async () => {
      await expect(as("acme", "viewer", (tx) => tx`select * from auth.get_my_idp()`)).rejects.toThrow(/only an admin/);
      await expect(as("acme", "viewer", (tx) => tx`select auth.configure_idp('https://x.example.test', 'c', null, '{}', false)`)).rejects.toThrow(/only an admin/);
      expect((await getMyIdp(app, { tenantId: T["beta"]!, userId: ADMIN["beta"]! }))!.issuer).toBe(ISS("beta"));
    });
    it("saving keeps the old secret when none is given, replaces it when one is, and is audited without the issuer or the secret", async () => {
      const ctx = { tenantId: T["acme"]!, userId: ADMIN["acme"]! };
      expect(await configureIdp(app, keys, ctx, { issuer: ISS("acme") + "/", clientId: "client-acme", clientSecret: "", requiredAmr: "mfa, hwk", enabled: true })).toMatchObject({ ok: true });
      expect((await loadTenantIdp(app, keys, SLUG["acme"]!, "https://x.test/cb"))).toMatchObject({ clientSecret: SECRET_A, requiredAmr: ["mfa", "hwk"], issuer: ISS("acme") });
      expect(await configureIdp(app, keys, ctx, { issuer: ISS("acme"), clientId: "client-acme", clientSecret: "a-brand-new-secret-0123456789", requiredAmr: "mfa", enabled: true })).toMatchObject({ ok: true }); // secret-scan:allow
      expect((await loadTenantIdp(app, keys, SLUG["acme"]!, "https://x.test/cb"))!.clientSecret).toBe("a-brand-new-secret-0123456789"); // secret-scan:allow
      const ev = await withTenant(owner, { tenantId: T["acme"]! }, (tx) => tx<{ subject: Record<string, unknown> }[]>`select subject from audit_events where action = 'admin.idp_configured'`);
      expect(ev.length).toBeGreaterThanOrEqual(2);
      expect(JSON.stringify(ev)).not.toMatch(/login\.|client-|brand-new|secret-for/);
    });
    it("rejects bad input", async () => {
      const ctx = { tenantId: T["acme"]!, userId: ADMIN["acme"]! };
      const base = { clientId: "c", clientSecret: "", requiredAmr: "", enabled: false };
      for (const issuer of ["http://login.example.com", "ftp://x", "not a url", "https://"]) expect(await configureIdp(app, keys, ctx, { ...base, issuer }), issuer).toMatchObject({ ok: false });
      expect(await configureIdp(app, keys, ctx, { ...base, issuer: ISS("acme"), requiredAmr: "UPPER CASE!" })).toMatchObject({ ok: false });
      expect(await configureIdp(app, keys, ctx, { ...base, issuer: ISS("acme"), clientSecret: "short" })).toMatchObject({ ok: false });
    });
    it("an organization that was never provisioned cannot create settings (so names cannot be claimed)", async () => {
      const lonely = randomUUID();
      const admin = await withTenant(owner, { tenantId: lonely }, async (tx) => {
        await tx`insert into tenants (id, name) values (${lonely}, 'lonely')`;
        return (await tx<{ id: string }[]>`insert into users (tenant_id, email, role) values (${lonely}, 'lonely@example.test', 'admin') returning id`)[0]!.id;
      });
      expect(await configureIdp(app, keys, { tenantId: lonely, userId: admin }, { issuer: "https://login.lonely.example.test", clientId: "c", clientSecret: "x".repeat(20), requiredAmr: "", enabled: true })).toEqual({ ok: false, message: "single sign-on has not been provisioned for this organization" });
    });
    it("one provider cannot be claimed by two organizations", async () => {
      const r = await configureIdp(app, keys, { tenantId: T["beta"]!, userId: ADMIN["beta"]! }, { issuer: ISS("acme"), clientId: "c", clientSecret: "", requiredAmr: "", enabled: true });
      expect(r).toEqual({ ok: false, message: "that identity provider is already used by another organization" });
    });
    it("cannot enable without a complete configuration", async () => {
      const r = await configureIdp(app, keys, { tenantId: T["gamma"]!, userId: ADMIN["gamma"]! }, { issuer: "https://login.gamma.example.test", clientId: "c", clientSecret: "", requiredAmr: "", enabled: true });
      expect(r).toEqual({ ok: false, message: "to enable single sign-on, set the issuer, client id and client secret first" });
      const ok = await configureIdp(app, keys, { tenantId: T["gamma"]!, userId: ADMIN["gamma"]! }, { issuer: "https://login.gamma.example.test", clientId: "c", clientSecret: "gamma-secret-0123456789", requiredAmr: "", enabled: true }); // secret-scan:allow
      expect(ok.ok).toBe(true);
      expect((await loadTenantIdp(app, keys, SLUG["gamma"]!, "https://x.test/cb"))?.tenantId).toBe(T["gamma"]);
    });
  });

  describe("identities and sessions stay inside their organization", () => {
    it("an admin can link only identities from their organization's own provider", async () => {
      const ctx = { tenantId: T["beta"]!, userId: ADMIN["beta"]! };
      const [nu] = await withTenant(owner, { tenantId: T["beta"]! }, (tx) => tx<{ id: string }[]>`insert into users (tenant_id, email, role) values (${T["beta"]!}, 'b-new@example.test', 'viewer') returning id`);
      await expect(withTenant(app, ctx, (tx) => tx`select auth.link_identity(${nu!.id}, ${ISS("acme")}, 'sneaky')`)).rejects.toThrow(/configured identity provider/);
      await expect(withTenant(app, ctx, (tx) => tx`select auth.link_identity(${nu!.id}, ${ISS("beta")}, 'ok-sub')`)).resolves.toBeTruthy();
    });
    it("the same subject at two organizations' providers signs into the right organization", async () => {
      const a = await loginIdentity(app, ISS("acme"), "sub-admin", newSessionToken().hash, 3600, null, T["acme"]!);
      const b = await loginIdentity(app, ISS("beta"), "sub-admin", newSessionToken().hash, 3600, null, T["beta"]!);
      expect(a!.tenantId).toBe(T["acme"]); expect(b!.tenantId).toBe(T["beta"]);
    });
    it("a sign-in started for one organization cannot produce a session in another", async () => {
      expect(await loginIdentity(app, ISS("acme"), "sub-admin", newSessionToken().hash, 3600, null, T["beta"]!)).toBeNull();
      expect(await loginIdentity(app, ISS("acme"), "sub-admin", newSessionToken().hash, 3600, null, T["acme"]!)).not.toBeNull(); // control
    });
  });
});
