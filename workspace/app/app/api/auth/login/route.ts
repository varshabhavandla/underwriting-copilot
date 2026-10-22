import { authorizationUrl, discover, pkce, randomToken } from "@/auth/oidc";
import { safeReturnTo, sealFlow } from "@/auth/flow";
import { FLOW_COOKIE, setCookie } from "@/auth/session";
import { masterKeyFromEnv } from "@/crypto/fieldCrypto";
import { withRequest } from "@/http/withRequest";
import { oidcConfig } from "@/server/services";

export const dynamic = "force-dynamic";

/** Starts sign-in: authorization code flow with PKCE, state and nonce. The flow secrets travel in a short-lived encrypted cookie. */
export const GET = withRequest("auth_login", { limit: { max: 20, windowMs: 60_000 } }, async (req) => {
  const cfg = oidcConfig();
  if (!cfg) return Response.json({ error: "sign-in is not configured" }, { status: 404 });
  const meta = await discover(cfg);
  const { verifier, challenge } = pkce();
  const state = randomToken();
  const nonce = randomToken();
  const returnTo = safeReturnTo(new URL(req.url).searchParams.get("returnTo"));
  const sealed = sealFlow(masterKeyFromEnv(), { state, nonce, verifier, returnTo, exp: Date.now() + 600_000 });
  const headers = new Headers({ location: authorizationUrl(meta, cfg, { state, nonce, challenge }), "cache-control": "no-store" });
  headers.append("set-cookie", setCookie(FLOW_COOKIE, sealed, 600));
  return new Response(null, { status: 302, headers });
});
