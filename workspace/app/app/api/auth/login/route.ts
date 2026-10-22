import { authorizationUrl, discover, pkce, randomToken } from "@/auth/oidc";
import { safeReturnTo, sealFlow } from "@/auth/flow";
import { isSlug } from "@/auth/idp";
import { FLOW_COOKIE, setCookie } from "@/auth/session";
import { masterKeyFromEnv } from "@/crypto/fieldCrypto";
import { withRequest } from "@/http/withRequest";
import { log } from "@/observability/log";
import { inc } from "@/observability/metrics";
import { authMode, globalIdp, tenantIdp } from "@/server/services";

export const dynamic = "force-dynamic";
const go = (location: string) => new Response(null, { status: 302, headers: { location, "cache-control": "no-store" } });

/**
 * Starts sign-in: authorization code flow with PKCE, state and nonce. The flow secrets travel in a short-lived encrypted cookie.
 * Per-tenant mode needs the organization name (?org=); an unknown, disabled or unconfigured organization gets the same generic page.
 */
export const GET = withRequest("auth_login", { limit: { max: 20, windowMs: 60_000 } }, async (req) => {
  const mode = authMode();
  if (mode === "dev") return Response.json({ error: "sign-in is not configured" }, { status: 404 });
  const q = new URL(req.url).searchParams;
  const returnTo = safeReturnTo(q.get("returnTo"));
  let slug: string | undefined;
  let cfg;
  if (mode === "per_tenant") {
    slug = (q.get("org") ?? "").trim().toLowerCase();
    if (!slug) return go(`/signin?returnTo=${encodeURIComponent(returnTo)}`);
    cfg = isSlug(slug) ? await tenantIdp(slug) : null;
    if (!cfg) { inc("auth_logins_total", { outcome: "unknown_organization" }); log("warn", "sign-in failed", { reason: "unknown_organization" }); return go("/forbidden?reason=signin"); }
  } else {
    cfg = globalIdp();
    if (!cfg) return Response.json({ error: "sign-in is not configured" }, { status: 404 });
  }
  const meta = await discover(cfg);
  const { verifier, challenge } = pkce();
  const state = randomToken();
  const nonce = randomToken();
  const sealed = sealFlow(masterKeyFromEnv(), { state, nonce, verifier, returnTo, exp: Date.now() + 600_000, ...(slug ? { slug } : {}) });
  const headers = new Headers({ location: authorizationUrl(meta, cfg, { state, nonce, challenge }), "cache-control": "no-store" });
  headers.append("set-cookie", setCookie(FLOW_COOKIE, sealed, 600));
  return new Response(null, { status: 302, headers });
});
