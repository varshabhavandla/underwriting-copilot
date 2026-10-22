import { clearCookie, cookieValue, endSession, resolveSession, SESSION_COOKIE } from "@/auth/session";
import { withTenant } from "@/db/client";
import { appendAudit } from "@/db/repo";
import { withRequest } from "@/http/withRequest";
import { inc } from "@/observability/metrics";
import { serverEnv } from "@/server-env";
import { appOrigin, infra } from "@/server/services";

export const dynamic = "force-dynamic";

/** Ends the session on the server (revocation is immediate) and clears the cookie. A cross-site form post cannot sign a user out: Origin must be ours. */
export const POST = withRequest("auth_logout", { limit: { max: 20, windowMs: 60_000 } }, async (req) => {
  const origin = appOrigin();
  if (!origin) return Response.json({ error: "sign-in is not configured" }, { status: 404 });
  if (req.headers.get("origin") !== origin) return Response.json({ error: "forbidden" }, { status: 403 });
  const token = cookieValue(req.headers.get("cookie"), SESSION_COOKIE);
  const { sql } = infra();
  const id = await resolveSession(sql, token, serverEnv().SESSION_IDLE_MINUTES * 60);
  if (id) {
    await withTenant(sql, { tenantId: id.tenantId, userId: id.userId }, (tx) =>
      appendAudit(tx, id.tenantId, { actorKind: "user", actorId: id.userId, action: "auth.logout", result: "ok" }));
  }
  await endSession(sql, token);
  inc("auth_logouts_total");
  // ASVS V14.3.1: ask the browser to drop cached pages and site storage that belonged to the signed-in user
  const h = new Headers({ location: "/signed-out", "cache-control": "no-store", "clear-site-data": '"cache", "storage"' });
  h.append("set-cookie", clearCookie(SESSION_COOKIE));
  return new Response(null, { status: 303, headers: h });
});
