/** Administration operations. Authorization is enforced by the database functions (admin-only, tenant-scoped, audited); these wrappers only turn their refusals into messages. */
import { withTenant, type Sql, type TenantContext } from "../db/client";

export type Outcome = { ok: true; message: string } | { ok: false; message: string };
type Ctx = TenantContext & { userId: string };

const ROLES = ["viewer", "processor", "underwriter", "admin"] as const;
export const isRole = (r: string): r is (typeof ROLES)[number] => (ROLES as readonly string[]).includes(r);
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Messages raised by our own functions (insufficient privilege, invalid parameter) are safe to show; anything else is not. */
function explain(e: unknown): Outcome {
  const code = (e as { code?: string }).code;
  if (code === "42501" || code === "22023") return { ok: false, message: (e as Error).message };
  if (code === "23505") return { ok: false, message: "that email address or identity is already in use" };
  throw e;
}
async function run(sql: Sql, ctx: Ctx, ok: string, fn: (tx: Parameters<Parameters<typeof withTenant>[2]>[0]) => Promise<unknown>): Promise<Outcome> {
  try {
    await withTenant(sql, ctx, fn as never);
    return { ok: true, message: ok };
  } catch (e) {
    return explain(e);
  }
}
const bad = (m: string): Outcome => ({ ok: false, message: m });

export const createUser = (sql: Sql, ctx: Ctx, email: string, role: string): Promise<Outcome> =>
  isRole(role) ? run(sql, ctx, "User created", (tx) => tx`select auth.create_user(${email.trim()}, ${role})`) : Promise.resolve(bad("invalid role"));
export const setUserRole = (sql: Sql, ctx: Ctx, userId: string, role: string): Promise<Outcome> =>
  UUID.test(userId) && isRole(role) ? run(sql, ctx, "Role changed", (tx) => tx`select auth.set_user_role(${userId}, ${role})`) : Promise.resolve(bad("invalid request"));
export const setUserDisabled = (sql: Sql, ctx: Ctx, userId: string, disabled: boolean): Promise<Outcome> =>
  UUID.test(userId) ? run(sql, ctx, disabled ? "User disabled and signed out" : "User enabled", (tx) => tx`select auth.set_user_disabled(${userId}, ${disabled})`) : Promise.resolve(bad("invalid request"));
export const linkIdentity = (sql: Sql, ctx: Ctx, userId: string, issuer: string | undefined, subject: string): Promise<Outcome> => {
  if (!issuer) return Promise.resolve(bad("sign-in is not configured"));
  const sub = subject.trim();
  if (!UUID.test(userId) || sub.length === 0 || sub.length > 255) return Promise.resolve(bad("enter the identity provider's subject identifier for this person"));
  return run(sql, ctx, "Identity linked", (tx) => tx`select auth.link_identity(${userId}, ${issuer}, ${sub})`);
};
export const unlinkIdentity = (sql: Sql, ctx: Ctx, userId: string): Promise<Outcome> =>
  UUID.test(userId) ? run(sql, ctx, "Identity unlinked and sessions ended", (tx) => tx`select auth.unlink_identity(${userId})`) : Promise.resolve(bad("invalid request"));
export const revokeUserSessions = (sql: Sql, ctx: Ctx, userId: string): Promise<Outcome> =>
  UUID.test(userId) ? run(sql, ctx, "Sessions ended", (tx) => tx`select auth.revoke_user_sessions(${userId})`) : Promise.resolve(bad("invalid request"));
export const revokeMySession = (sql: Sql, ctx: Ctx, sessionId: string): Promise<Outcome> =>
  UUID.test(sessionId) ? run(sql, ctx, "Session ended", (tx) => tx`select auth.revoke_my_session(${sessionId})`) : Promise.resolve(bad("invalid request"));
export const revokeMyOtherSessions = (sql: Sql, ctx: Ctx, currentHash: Buffer): Promise<Outcome> =>
  run(sql, ctx, "Other sessions ended", (tx) => tx`select auth.revoke_my_other_sessions(${currentHash})`);
