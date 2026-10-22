import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { connect, withTenant, type Sql } from "../../src/db/client";
import { endSession, loginIdentity, newSessionToken, resolveSession } from "../../src/auth/session";
import { dbEnabled, urls } from "./urls";

const ISS = "https://idp.example.test";
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

describe.skipIf(!dbEnabled)("authentication state (real Postgres)", () => {
  let owner: Sql, app: Sql;
  const T: Record<string, string> = {};
  const U: Record<string, string> = {}; // key: tenant-role

  async function provision(tag: string): Promise<void> {
    const tenant = randomUUID();
    T[tag] = tenant;
    await withTenant(owner, { tenantId: tenant }, async (tx) => {
      await tx`insert into tenants (id, name) values (${tenant}, ${tag})`;
      for (const role of ["admin", "underwriter", "viewer"]) {
        const [u] = await tx<{ id: string }[]>`insert into users (tenant_id, email, role) values (${tenant}, ${`${tag}-${role}@example.test`}, ${role}) returning id`;
        U[`${tag}-${role}`] = u!.id;
      }
    });
  }
  // identities are owner-only, so insert them with the owner connection directly
  async function link(tag: string, role: string): Promise<void> {
    await owner`insert into auth.identities (tenant_id, user_id, issuer, subject) values (${T[tag]!}, ${U[`${tag}-${role}`]!}, ${ISS}, ${`sub-${tag}-${role}`}) on conflict do nothing`;
  }
  const login = (tag: string, role: string, secs = 3600) => { const t = newSessionToken(); return loginIdentity(app, ISS, `sub-${tag}-${role}`, t.hash, secs).then((id) => ({ id, ...t })); };

  beforeAll(async () => {
    owner = connect(urls.owner());
    app = connect(urls.app());
    for (const tag of ["a", "b"]) { await provision(tag); for (const r of ["admin", "underwriter", "viewer"]) await link(tag, r); }
  });
  afterAll(async () => { await Promise.all([owner.end(), app.end()]); });

  describe("what the application role can and cannot touch", () => {
    it("control: the owner role can read identities and sessions", async () => {
      expect((await owner`select count(*)::int as n from auth.identities`)[0]!.n).toBeGreaterThanOrEqual(6);
    });
    it("the application role has no direct access to identities or sessions", async () => {
      await expect(app`select * from auth.identities`).rejects.toThrow(/permission denied/);
      await expect(app`select * from auth.sessions`).rejects.toThrow(/permission denied/);
      await expect(app`insert into auth.sessions (tenant_id, user_id, token_hash, expires_at) values (${T["a"]!}, ${U["a-admin"]!}, ${Buffer.alloc(32)}, now() + interval '1 day')`).rejects.toThrow(/permission denied/);
    });
    it("internal helper functions are not callable by the application role", async () => {
      await expect(app`select * from auth.user_state(${T["a"]!}, ${U["a-admin"]!})`).rejects.toThrow(/permission denied/);
      await expect(app`select auth.actor_role()`).rejects.toThrow(/permission denied/);
    });
    it("every table in the auth schema has forced row-level security with the owner-only policy (default deny for anyone else)", async () => {
      const tables = await owner<{ relname: string; relrowsecurity: boolean; relforcerowsecurity: boolean }[]>`
        select c.relname, c.relrowsecurity, c.relforcerowsecurity from pg_class c join pg_namespace n on n.oid = c.relnamespace where n.nspname = 'auth' and c.relkind = 'r'`;
      const policies = await owner<{ tablename: string }[]>`select tablename from pg_policies where schemaname = 'auth' and policyname = 'owner_only'`;
      expect(tables.length).toBeGreaterThanOrEqual(3);
      for (const t of tables) { expect(t.relrowsecurity, t.relname).toBe(true); expect(t.relforcerowsecurity, t.relname).toBe(true); expect(policies.some((p) => p.tablename === t.relname), t.relname).toBe(true); }
    });
  });

  describe("login and session resolution", () => {
    it("creates a session for a known identity and resolves it to the right tenant, user and role", async () => {
      const s = await login("a", "underwriter");
      expect(s.id).toMatchObject({ tenantId: T["a"], userId: U["a-underwriter"], role: "underwriter" });
      expect(await resolveSession(app, s.token, 1800)).toMatchObject({ tenantId: T["a"], userId: U["a-underwriter"], role: "underwriter" });
    });
    it("refuses an unknown identity", async () => {
      const t = newSessionToken();
      expect(await loginIdentity(app, ISS, "nobody", t.hash, 3600)).toBeNull();
      expect(await loginIdentity(app, "https://other-idp.example.test", "sub-a-admin", t.hash, 3600)).toBeNull();
    });
    it("stores only the hash of the token", async () => {
      const s = await login("a", "viewer");
      const rows = await owner<{ token_hash: Buffer }[]>`select token_hash from auth.sessions where id = ${s.id!.sessionId}`;
      expect(rows[0]!.token_hash.equals(s.hash)).toBe(true);
      expect(rows[0]!.token_hash.toString("utf8")).not.toContain(s.token);
    });
    it("an unknown or malformed token resolves to nothing", async () => {
      expect(await resolveSession(app, newSessionToken().token, 1800)).toBeNull();
      expect(await resolveSession(app, "x".repeat(43), 1800)).toBeNull();
    });
    it("rejects an absurd session lifetime", async () => {
      await expect(loginIdentity(app, ISS, "sub-a-admin", newSessionToken().hash, 90 * 86400)).rejects.toThrow(/invalid session lifetime/);
    });
    it("the absolute lifetime ends a session", async () => {
      const s = await login("a", "viewer", 1);
      expect(await resolveSession(app, s.token, 1800)).not.toBeNull();
      await sleep(1200);
      expect(await resolveSession(app, s.token, 1800)).toBeNull();
    });
    it("inactivity ends a session (control: it is valid within the idle window)", async () => {
      const s = await login("a", "viewer");
      expect(await resolveSession(app, s.token, 1800)).not.toBeNull();
      await sleep(1200);
      expect(await resolveSession(app, s.token, 1)).toBeNull();
    });
    it("logout revokes immediately and cannot be undone by presenting the token again", async () => {
      const s = await login("a", "viewer");
      await endSession(app, s.token);
      expect(await resolveSession(app, s.token, 1800)).toBeNull();
    });
    it("two sessions for one user are independent", async () => {
      const s1 = await login("a", "viewer"), s2 = await login("a", "viewer");
      await endSession(app, s1.token);
      expect(await resolveSession(app, s1.token, 1800)).toBeNull();
      expect(await resolveSession(app, s2.token, 1800)).not.toBeNull();
    });
    it("resolving a session does not leak a tenant setting into the caller's transaction", async () => {
      const s = await login("a", "viewer");
      const seen = await app.begin(async (tx) => {
        await tx`select set_config('app.tenant_id', ${T["b"]!}, true)`;
        await tx`select * from auth.resolve_session(${s.hash}, make_interval(secs => 1800))`;
        return (await tx<{ v: string }[]>`select current_setting('app.tenant_id', true) as v`)[0]!.v;
      });
      expect(seen).toBe(T["b"]);
    });
  });

  describe("disabled users, revocation and administration (tenant context)", () => {
    it("a disabled user cannot log in and an existing session stops working", async () => {
      const s = await login("a", "viewer");
      await withTenant(owner, { tenantId: T["a"]! }, (tx) => tx`update users set disabled_at = now() where id = ${U["a-viewer"]!}`);
      expect(await resolveSession(app, s.token, 1800)).toBeNull();
      expect(await login("a", "viewer").then((x) => x.id)).toBeNull();
      await withTenant(owner, { tenantId: T["a"]! }, (tx) => tx`update users set disabled_at = null where id = ${U["a-viewer"]!}`);
      expect(await login("a", "viewer").then((x) => x.id)).not.toBeNull();
    });
    it("an admin can revoke another user's sessions in their own tenant", async () => {
      const s = await login("a", "underwriter");
      const n = await withTenant(app, { tenantId: T["a"]!, userId: U["a-admin"]! }, (tx) => tx<{ n: number }[]>`select auth.revoke_user_sessions(${U["a-underwriter"]!}) as n`);
      expect(n[0]!.n).toBeGreaterThanOrEqual(1);
      expect(await resolveSession(app, s.token, 1800)).toBeNull();
    });
    it("a non-admin cannot revoke another user's sessions; control: they can revoke their own", async () => {
      await login("a", "viewer");
      await expect(withTenant(app, { tenantId: T["a"]!, userId: U["a-underwriter"]! }, (tx) => tx`select auth.revoke_user_sessions(${U["a-viewer"]!})`)).rejects.toThrow(/only an admin/);
      await expect(withTenant(app, { tenantId: T["a"]!, userId: U["a-underwriter"]! }, (tx) => tx`select auth.revoke_user_sessions(${U["a-underwriter"]!})`)).resolves.toBeTruthy();
    });
    it("an admin of another tenant cannot touch this tenant's sessions", async () => {
      const s = await login("a", "viewer");
      const r = await withTenant(app, { tenantId: T["b"]!, userId: U["b-admin"]! }, (tx) => tx<{ n: number }[]>`select auth.revoke_user_sessions(${U["a-viewer"]!}) as n`);
      expect(r[0]!.n).toBe(0);
      expect(await resolveSession(app, s.token, 1800)).not.toBeNull();
    });
    it("only an admin can disable a user, never themselves; disabling revokes sessions", async () => {
      const s = await login("a", "viewer");
      await expect(withTenant(app, { tenantId: T["a"]!, userId: U["a-underwriter"]! }, (tx) => tx`select auth.set_user_disabled(${U["a-viewer"]!}, true)`)).rejects.toThrow(/only an admin/);
      await expect(withTenant(app, { tenantId: T["a"]!, userId: U["a-admin"]! }, (tx) => tx`select auth.set_user_disabled(${U["a-admin"]!}, true)`)).rejects.toThrow(/themselves/);
      await withTenant(app, { tenantId: T["a"]!, userId: U["a-admin"]! }, (tx) => tx`select auth.set_user_disabled(${U["a-viewer"]!}, true)`);
      expect(await resolveSession(app, s.token, 1800)).toBeNull();
      await withTenant(app, { tenantId: T["a"]!, userId: U["a-admin"]! }, (tx) => tx`select auth.set_user_disabled(${U["a-viewer"]!}, false)`);
    });
    it("only an admin can link an identity, and only to a user in their own tenant", async () => {
      const [nu] = await withTenant(owner, { tenantId: T["a"]! }, (tx) => tx<{ id: string }[]>`insert into users (tenant_id, email, role) values (${T["a"]!}, ${`new-${randomUUID()}@example.test`}, 'processor') returning id`);
      U["a-new"] = nu!.id;
      await expect(withTenant(app, { tenantId: T["a"]!, userId: U["a-underwriter"]! }, (tx) => tx`select auth.link_identity(${U["a-new"]!}, ${ISS}, 'new-sub')`)).rejects.toThrow(/only an admin/);
      await expect(withTenant(app, { tenantId: T["a"]!, userId: U["a-admin"]! }, (tx) => tx`select auth.link_identity(${U["b-viewer"]!}, ${ISS}, 'cross-sub')`)).rejects.toThrow(/unknown user/);
      expect(await loginIdentity(app, ISS, "new-sub", newSessionToken().hash, 3600)).toBeNull(); // control: not linked yet
      await withTenant(app, { tenantId: T["a"]!, userId: U["a-admin"]! }, (tx) => tx`select auth.link_identity(${U["a-new"]!}, ${ISS}, 'new-sub')`);
      expect(await loginIdentity(app, ISS, "new-sub", newSessionToken().hash, 3600)).toMatchObject({ tenantId: T["a"], role: "processor" });
    });
    it("one identity cannot be linked to two users, and one user has one identity per issuer", async () => {
      await expect(withTenant(app, { tenantId: T["a"]!, userId: U["a-admin"]! }, (tx) => tx`select auth.link_identity(${U["a-underwriter"]!}, ${ISS}, 'new-sub')`)).rejects.toThrow(/duplicate key|unique/);
      await expect(withTenant(app, { tenantId: T["a"]!, userId: U["a-admin"]! }, (tx) => tx`select auth.link_identity(${U["a-new"]!}, ${ISS}, 'second-sub')`)).rejects.toThrow(/duplicate key|unique/);
    });
  });
});
