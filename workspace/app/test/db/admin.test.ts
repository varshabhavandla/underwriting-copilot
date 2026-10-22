import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { connect, withTenant, type Sql } from "../../src/db/client";
import { verifyAuditChain } from "../../src/db/repo";
import { loginIdentity, newSessionToken, resolveSession } from "../../src/auth/session";
import { dbEnabled, urls } from "./urls";

const ISS = "https://idp.example.test";

describe.skipIf(!dbEnabled)("user, identity and session administration (real Postgres)", () => {
  let owner: Sql, app: Sql;
  const T: Record<string, string> = {}, U: Record<string, string> = {};

  async function provision(tag: string): Promise<void> {
    const tenant = randomUUID();
    T[tag] = tenant;
    await withTenant(owner, { tenantId: tenant }, async (tx) => {
      await tx`insert into tenants (id, name) values (${tenant}, ${tag})`;
      for (const role of ["admin", "underwriter", "viewer"]) {
        const [u] = await tx<{ id: string }[]>`insert into users (tenant_id, email, role) values (${tenant}, ${`${tag}-${role}@example.test`}, ${role}) returning id`;
        U[`${tag}-${role}`] = u!.id;
        await tx`insert into auth.identities (tenant_id, user_id, issuer, subject) values (${tenant}, ${u!.id}, ${ISS}, ${`adm-${tag}-${role}`})`;
      }
    });
  }
  const as = <R>(tag: string, role: string, fn: (tx: Parameters<Parameters<typeof withTenant>[2]>[0]) => Promise<R>) => withTenant(app, { tenantId: T[tag]!, userId: U[`${tag}-${role}`]! }, fn as never) as Promise<R>;
  const login = async (tag: string, role: string) => { const t = newSessionToken(); const id = await loginIdentity(app, ISS, `adm-${tag}-${role}`, t.hash, 3600, "TestBrowser/1.0"); return { id, ...t }; };
  const audit = (tag: string, action: string) => withTenant(owner, { tenantId: T[tag]! }, (tx) => tx<{ subject: Record<string, unknown> }[]>`select subject from audit_events where action = ${action} order by seq`);

  beforeAll(async () => { owner = connect(urls.owner()); app = connect(urls.app()); await provision("a"); await provision("b"); });
  afterAll(async () => { await Promise.all([owner.end(), app.end()]); });

  it("the application role can no longer insert users directly (control: the owner role can)", async () => {
    await expect(withTenant(app, { tenantId: T["a"]! }, (tx) => tx`insert into users (tenant_id, email, role) values (${T["a"]!}, 'x@example.test', 'admin')`)).rejects.toThrow(/permission denied/);
    await expect(withTenant(owner, { tenantId: T["a"]! }, (tx) => tx`insert into users (tenant_id, email, role) values (${T["a"]!}, 'ok@example.test', 'viewer')`)).resolves.toBeTruthy();
  });

  describe("create_user", () => {
    it("an admin creates a user; the email is normalized and the audit event holds ids, not the address", async () => {
      const [r] = await as("a", "admin", (tx) => tx<{ id: string }[]>`select auth.create_user('New.Person@Example.test', 'processor') as id`);
      const [u] = await withTenant(owner, { tenantId: T["a"]! }, (tx) => tx<{ email: string; role: string }[]>`select email, role from users where id = ${r!.id}`);
      expect(u).toEqual({ email: "new.person@example.test", role: "processor" });
      const ev = await audit("a", "admin.user_created");
      expect(JSON.stringify(ev)).toContain(r!.id);
      expect(JSON.stringify(ev)).not.toContain("example.test");
    });
    it("a non-admin cannot; control: the admin can", async () => {
      await expect(as("a", "underwriter", (tx) => tx`select auth.create_user('x1@example.test', 'viewer')`)).rejects.toThrow(/only an admin/);
      await expect(as("a", "viewer", (tx) => tx`select auth.create_user('x2@example.test', 'viewer')`)).rejects.toThrow(/only an admin/);
      await expect(as("a", "admin", (tx) => tx`select auth.create_user('x3@example.test', 'viewer')`)).resolves.toBeTruthy();
    });
    it("rejects bad roles and bad addresses, and duplicates within a tenant (but not across tenants)", async () => {
      await expect(as("a", "admin", (tx) => tx`select auth.create_user('y@example.test', 'superuser')`)).rejects.toThrow(/invalid role/);
      for (const bad of ["no-at-sign", "a@b", "a b@example.test", "@example.test", "a@@example.test"]) await expect(as("a", "admin", (tx) => tx`select auth.create_user(${bad}, 'viewer')`), bad).rejects.toThrow(/invalid email/);
      await expect(as("a", "admin", (tx) => tx`select auth.create_user('a-viewer@example.test', 'viewer')`)).rejects.toThrow(/duplicate key|unique/);
      await expect(as("b", "admin", (tx) => tx`select auth.create_user('a-viewer@example.test', 'viewer')`)).resolves.toBeTruthy();
    });
    it("is refused with no acting user", async () => {
      await expect(withTenant(app, { tenantId: T["a"]! }, (tx) => tx`select auth.create_user('z@example.test', 'viewer')`)).rejects.toThrow(/no actor/);
    });
  });

  describe("roles, disabling and identities", () => {
    it("a role change takes effect on the very next request and is audited with before and after", async () => {
      const s = await login("a", "viewer");
      expect(await resolveSession(app, s.token, 1800)).toMatchObject({ role: "viewer" });
      await as("a", "admin", (tx) => tx`select auth.set_user_role(${U["a-viewer"]!}, 'processor')`);
      expect(await resolveSession(app, s.token, 1800)).toMatchObject({ role: "processor" });
      expect(JSON.stringify(await audit("a", "admin.role_changed"))).toContain('"from":"viewer"');
      await as("a", "admin", (tx) => tx`select auth.set_user_role(${U["a-viewer"]!}, 'viewer')`);
    });
    it("an admin cannot change their own role; non-admins cannot change anyone's; other tenants' users are unknown", async () => {
      await expect(as("a", "admin", (tx) => tx`select auth.set_user_role(${U["a-admin"]!}, 'viewer')`)).rejects.toThrow(/own role/);
      await expect(as("a", "underwriter", (tx) => tx`select auth.set_user_role(${U["a-viewer"]!}, 'admin')`)).rejects.toThrow(/only an admin/);
      await expect(as("a", "admin", (tx) => tx`select auth.set_user_role(${U["b-viewer"]!}, 'admin')`)).rejects.toThrow(/unknown user/);
      await expect(as("a", "admin", (tx) => tx`select auth.set_user_role(${U["a-viewer"]!}, 'root')`)).rejects.toThrow(/invalid role/);
    });
    it("disabling and enabling are audited, and disabling an unknown user fails", async () => {
      await as("a", "admin", (tx) => tx`select auth.set_user_disabled(${U["a-viewer"]!}, true)`);
      await as("a", "admin", (tx) => tx`select auth.set_user_disabled(${U["a-viewer"]!}, false)`);
      expect((await audit("a", "admin.user_disabled")).length).toBeGreaterThan(0);
      expect((await audit("a", "admin.user_enabled")).length).toBeGreaterThan(0);
      await expect(as("a", "admin", (tx) => tx`select auth.set_user_disabled(${U["b-viewer"]!}, true)`)).rejects.toThrow(/unknown user/);
    });
    it("unlinking an identity ends the user's sessions and blocks sign-in until relinked; an admin cannot unlink themselves", async () => {
      const s = await login("a", "underwriter");
      await as("a", "admin", (tx) => tx`select auth.unlink_identity(${U["a-underwriter"]!})`);
      expect(await resolveSession(app, s.token, 1800)).toBeNull();
      expect((await login("a", "underwriter")).id).toBeNull();
      await as("a", "admin", (tx) => tx`select auth.link_identity(${U["a-underwriter"]!}, ${ISS}, 'adm-a-underwriter')`);
      expect((await login("a", "underwriter")).id).not.toBeNull();
      await expect(as("a", "admin", (tx) => tx`select auth.unlink_identity(${U["a-admin"]!})`)).rejects.toThrow(/own identity/);
      await expect(as("a", "viewer", (tx) => tx`select auth.unlink_identity(${U["a-underwriter"]!})`)).rejects.toThrow(/only an admin/);
    });
  });

  describe("listing", () => {
    it("an admin lists only their own tenant's users with identity and session counts", async () => {
      await login("a", "viewer");
      const rows = await as("a", "admin", (tx) => tx<{ email: string; role: string; issuer: string | null; sessions: number }[]>`select * from auth.list_users()`);
      expect(rows.every((r) => !r.email.startsWith("b-"))).toBe(true);
      const v = rows.find((r) => r.email === "a-viewer@example.test")!;
      expect(v).toMatchObject({ role: "viewer", issuer: ISS });
      expect(v.sessions).toBeGreaterThanOrEqual(1);
      expect(rows.some((r) => r.issuer === null)).toBe(true); // users without an identity are listed too
    });
    it("a non-admin cannot list users", async () => {
      await expect(as("a", "underwriter", (tx) => tx`select * from auth.list_users()`)).rejects.toThrow(/only an admin/);
    });
  });

  describe("my sessions", () => {
    it("lists only the caller's live sessions, flags the current one, and shows the browser", async () => {
      const mine = await login("a", "underwriter"), other = await login("a", "viewer");
      const rows = await as("a", "underwriter", (tx) => tx<{ id: string; is_current: boolean; user_agent: string }[]>`select * from auth.list_my_sessions(${mine.hash})`);
      expect(rows.some((r) => r.id === mine.id!.sessionId && r.is_current)).toBe(true);
      expect(rows.some((r) => r.id === other.id!.sessionId)).toBe(false);
      expect(rows[0]!.user_agent).toBe("TestBrowser/1.0");
    });
    it("a user can end their own session but not someone else's; control: ending their own works", async () => {
      const mine = await login("a", "underwriter"), other = await login("a", "viewer");
      const [x] = await as("a", "underwriter", (tx) => tx<{ r: boolean }[]>`select auth.revoke_my_session(${other.id!.sessionId}) as r`);
      expect(x!.r).toBe(false);
      expect(await resolveSession(app, other.token, 1800)).not.toBeNull();
      const [y] = await as("a", "underwriter", (tx) => tx<{ r: boolean }[]>`select auth.revoke_my_session(${mine.id!.sessionId}) as r`);
      expect(y!.r).toBe(true);
      expect(await resolveSession(app, mine.token, 1800)).toBeNull();
    });
    it("end-all-others keeps the current session only", async () => {
      const keep = await login("a", "underwriter"), drop1 = await login("a", "underwriter"), drop2 = await login("a", "underwriter");
      await as("a", "underwriter", (tx) => tx`select auth.revoke_my_other_sessions(${keep.hash})`);
      expect(await resolveSession(app, keep.token, 1800)).not.toBeNull();
      expect(await resolveSession(app, drop1.token, 1800)).toBeNull();
      expect(await resolveSession(app, drop2.token, 1800)).toBeNull();
    });
    it("another tenant's user cannot end this tenant's session by id", async () => {
      const s = await login("a", "viewer");
      const [r] = await as("b", "admin", (tx) => tx<{ r: boolean }[]>`select auth.revoke_my_session(${s.id!.sessionId}) as r`);
      expect(r!.r).toBe(false);
      expect(await resolveSession(app, s.token, 1800)).not.toBeNull();
    });
  });

  it("the tenant audit ledger still verifies after all of this", async () => {
    expect(await withTenant(owner, { tenantId: T["a"]! }, (tx) => verifyAuditChain(tx))).toBeNull();
  });
});
