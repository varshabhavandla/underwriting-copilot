/**
 * A minimal OpenID Connect provider for LOCAL DEVELOPMENT AND TESTS ONLY: authorization code flow with PKCE, signed ID tokens.
 * It exists so sign-in can be exercised end to end without a real provider, and so tests can make it misbehave on purpose.
 * It refuses to start in production and must never be deployed.
 */
import { createHash, randomBytes, timingSafeEqual } from "node:crypto";
import { createServer, type Server } from "node:http";
import { exportJWK, generateKeyPair, SignJWT, type JWK } from "jose";

export interface FakeUser { sub: string; label: string }
export interface FakeIdpOptions { port?: number; clientId: string; clientSecret: string; redirectUri: string; users: FakeUser[] }
export interface Misbehavior {
  /** Claims merged over the normal ones (use undefined to drop one). */
  claims?: Record<string, unknown>;
  issuer?: string;
  expiresIn?: string;
  issuedAt?: number;
  alg?: "RS256" | "HS256" | "none";
  /** Sign with a key the discovery document does not publish. */
  foreignKey?: boolean;
}
export interface FakeIdp { issuer: string; port: number; server: Server; misbehave: Misbehavior; jwk: JWK; close(): Promise<void>; tokensIssued: number }

const b64 = (b: Buffer) => b.toString("base64url");

export async function startFakeIdp(o: FakeIdpOptions): Promise<FakeIdp> {
  if (process.env["NODE_ENV"] === "production") throw new Error("the fake identity provider must not run in production");
  const { publicKey, privateKey } = await generateKeyPair("RS256", { extractable: true });
  const foreign = await generateKeyPair("RS256");
  const jwk = { ...(await exportJWK(publicKey)), kid: "fake-1", alg: "RS256", use: "sig" };
  const codes = new Map<string, { sub: string; nonce: string; challenge: string; redirectUri: string; exp: number }>();
  const state: FakeIdp = { issuer: "", port: 0, server: undefined as never, misbehave: {}, jwk, close: async () => {}, tokensIssued: 0 };

  const server = createServer(async (req, res) => {
    const u = new URL(req.url ?? "/", state.issuer || "http://127.0.0.1");
    const send = (status: number, body: unknown, type = "application/json") => { res.writeHead(status, { "content-type": type, "cache-control": "no-store" }); res.end(typeof body === "string" ? body : JSON.stringify(body)); };
    if (u.pathname === "/.well-known/openid-configuration") {
      return send(200, { issuer: state.issuer, authorization_endpoint: `${state.issuer}/authorize`, token_endpoint: `${state.issuer}/token`, jwks_uri: `${state.issuer}/jwks`,
        response_types_supported: ["code"], id_token_signing_alg_values_supported: ["RS256"], code_challenge_methods_supported: ["S256"] });
    }
    if (u.pathname === "/jwks") return send(200, { keys: [jwk] });
    if (u.pathname === "/authorize") {
      const q = u.searchParams;
      if (q.get("client_id") !== o.clientId || q.get("redirect_uri") !== o.redirectUri || q.get("response_type") !== "code" || q.get("code_challenge_method") !== "S256" || !q.get("code_challenge") || !q.get("state") || !q.get("nonce")) {
        return send(400, { error: "invalid_request" });
      }
      const pick = q.get("fake_sub");
      if (!pick) {
        const links = o.users.map((x) => { const n = new URLSearchParams(q); n.set("fake_sub", x.sub); return `<li><a href="/authorize?${n}">${x.label.replace(/[<>&"]/g, "")}</a></li>`; }).join("");
        return send(200, `<!doctype html><meta charset=utf-8><title>Fake identity provider</title><h1>Development sign-in</h1><p>Local fake provider. Choose a synthetic user.</p><ul>${links}</ul>`, "text/html; charset=utf-8");
      }
      if (!o.users.some((x) => x.sub === pick)) return send(400, { error: "unknown_user" });
      const code = b64(randomBytes(24));
      codes.set(code, { sub: pick, nonce: q.get("nonce")!, challenge: q.get("code_challenge")!, redirectUri: o.redirectUri, exp: Date.now() + 60_000 });
      const back = new URL(o.redirectUri); back.searchParams.set("code", code); back.searchParams.set("state", q.get("state")!);
      res.writeHead(302, { location: back.toString() }); return res.end();
    }
    if (u.pathname === "/token" && req.method === "POST") {
      let raw = ""; for await (const c of req) raw += c;
      const form = new URLSearchParams(raw);
      const basic = /^Basic (.+)$/.exec(req.headers["authorization"] ?? "")?.[1];
      const [id, secret] = basic ? Buffer.from(basic, "base64").toString().split(":").map(decodeURIComponent) : [form.get("client_id"), form.get("client_secret")];
      const a = Buffer.from(secret ?? ""), b = Buffer.from(o.clientSecret);
      if (id !== o.clientId || a.length !== b.length || !timingSafeEqual(a, b)) return send(401, { error: "invalid_client" });
      const rec = codes.get(form.get("code") ?? "");
      codes.delete(form.get("code") ?? ""); // single use
      if (!rec || rec.exp < Date.now() || form.get("grant_type") !== "authorization_code" || form.get("redirect_uri") !== rec.redirectUri) return send(400, { error: "invalid_grant" });
      const verifier = form.get("code_verifier") ?? "";
      if (b64(createHash("sha256").update(verifier).digest()) !== rec.challenge) return send(400, { error: "invalid_grant", error_description: "pkce" });
      const m = state.misbehave;
      const claims: Record<string, unknown> = { amr: ["pwd", "mfa"], nonce: rec.nonce, ...m.claims };
      for (const k of Object.keys(claims)) if (claims[k] === undefined) delete claims[k];
      let jwt: string;
      if (m.alg === "none") {
        const enc = (x: unknown) => Buffer.from(JSON.stringify(x)).toString("base64url");
        jwt = `${enc({ alg: "none", typ: "JWT" })}.${enc({ iss: m.issuer ?? state.issuer, aud: o.clientId, sub: rec.sub, iat: Math.floor(Date.now() / 1000), exp: Math.floor(Date.now() / 1000) + 300, ...claims })}.`;
      } else if (m.alg === "HS256") {
        // classic algorithm-confusion attempt: sign with the public key material as an HMAC secret
        jwt = await new SignJWT({ ...claims, sub: rec.sub }).setProtectedHeader({ alg: "HS256", kid: "fake-1" }).setIssuer(state.issuer).setAudience(o.clientId).setIssuedAt().setExpirationTime("5m").sign(Buffer.from(JSON.stringify(jwk)));
      } else {
        let t = new SignJWT({ ...claims, sub: rec.sub }).setProtectedHeader({ alg: "RS256", kid: "fake-1" }).setIssuer(m.issuer ?? state.issuer).setAudience((m.claims?.["aud"] as string | string[] | undefined) ?? o.clientId)
          .setIssuedAt(m.issuedAt).setExpirationTime(m.expiresIn ?? "5m");
        if (m.claims && "sub" in m.claims) t = t.setSubject(String(m.claims["sub"]));
        jwt = await t.sign(m.foreignKey ? foreign.privateKey : privateKey);
      }
      state.tokensIssued++;
      return send(200, { id_token: jwt, token_type: "Bearer", access_token: "unused" });
    }
    send(404, { error: "not_found" });
  });
  await new Promise<void>((r) => server.listen(o.port ?? 0, "127.0.0.1", r));
  const port = (server.address() as { port: number }).port;
  state.port = port; state.issuer = `http://127.0.0.1:${port}`; state.server = server;
  state.close = () => new Promise((r) => { server.closeAllConnections?.(); server.close(() => r()); });
  return state;
}
