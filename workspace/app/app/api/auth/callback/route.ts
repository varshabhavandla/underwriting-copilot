import { timingSafeEqual } from "node:crypto";
import { AuthError, discover, exchangeCode, keysFor, verifyIdToken } from "@/auth/oidc";
import { openFlow } from "@/auth/flow";
import { clearCookie, cookieValue, FLOW_COOKIE, loginIdentity, newSessionToken, SESSION_COOKIE, setCookie } from "@/auth/session";
import { masterKeyFromEnv } from "@/crypto/fieldCrypto";
import { withTenant } from "@/db/client";
import { appendAudit } from "@/db/repo";
import { withRequest } from "@/http/withRequest";
import { log } from "@/observability/log";
import { inc } from "@/observability/metrics";
import { serverEnv } from "@/server-env";
import { authMode, globalIdp, infra, tenantIdp } from "@/server/services";

export const dynamic = "force-dynamic";
const same = (a: string, b: string) => a.length === b.length && timingSafeEqual(Buffer.from(a), Buffer.from(b));

/** Completes sign-in. Any failure ends at a generic page and a log line with a reason code; the reason is never shown to the visitor. */
export const GET = withRequest("auth_callback", { limit: { max: 20, windowMs: 60_000 } }, async (req) => {
  const fail = (reason: string, status = 302) => {
    inc("auth_logins_total", { outcome: reason });
    log("warn", "sign-in failed", { reason });
    const h = new Headers({ location: "/forbidden?reason=signin", "cache-control": "no-store" });
    h.append("set-cookie", clearCookie(FLOW_COOKIE));
    return new Response(null, { status, headers: h });
  };
  if (authMode() === "dev") return Response.json({ error: "sign-in is not configured" }, { status: 404 });
  const url = new URL(req.url);
  if (url.searchParams.get("error")) return fail("provider_error");
  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");
  const flow = openFlow(masterKeyFromEnv(), cookieValue(req.headers.get("cookie"), FLOW_COOKIE) ?? "");
  if (!code || !state || !flow) return fail("missing_or_expired_flow");
  if (code.length > 2048 || !same(state, flow.state)) return fail("state_mismatch");
  // the provider is taken from our own sealed flow cookie, never from the request
  const cfg = flow.slug ? await tenantIdp(flow.slug) : authMode() === "global" ? globalIdp() : null;
  if (!cfg) return fail("unknown_organization");
  try {
    const meta = await discover(cfg);
    const idToken = await exchangeCode(meta, cfg, code, flow.verifier);
    const who = await verifyIdToken(idToken, keysFor(meta), cfg, flow.nonce);
    const env = serverEnv();
    const { sql } = infra();
    const { token, hash } = newSessionToken();
    const id = await loginIdentity(sql, who.issuer, who.subject, hash, env.SESSION_ABSOLUTE_HOURS * 3600, req.headers.get("user-agent"), flow.slug && "tenantId" in cfg ? (cfg as { tenantId: string }).tenantId : null);
    if (!id) return fail("unknown_or_disabled_identity");
    await withTenant(sql, { tenantId: id.tenantId, userId: id.userId }, (tx) =>
      appendAudit(tx, id.tenantId, { actorKind: "user", actorId: id.userId, action: "auth.login", subject: { amr: who.amr }, result: "ok" }));
    inc("auth_logins_total", { outcome: "ok" });
    const h = new Headers({ location: flow.returnTo, "cache-control": "no-store" });
    h.append("set-cookie", setCookie(SESSION_COOKIE, token, env.SESSION_ABSOLUTE_HOURS * 3600));
    h.append("set-cookie", clearCookie(FLOW_COOKIE));
    return new Response(null, { status: 302, headers: h });
  } catch (e) {
    if (e instanceof AuthError) return fail(e.code);
    log("error", "sign-in error", { error: e });
    return fail("error");
  }
});
