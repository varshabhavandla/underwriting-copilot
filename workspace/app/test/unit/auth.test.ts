import { createHash, randomBytes } from "node:crypto";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { createLocalJWKSet } from "jose";
import { ALLOWED_ALGS, AuthError, authorizationUrl, clearDiscoveryCache, discover, exchangeCode, pkce, verifyIdToken, type OidcConfig } from "../../src/auth/oidc";
import { openFlow, safeReturnTo, sealFlow } from "../../src/auth/flow";
import { can } from "../../src/auth/roles";
import { clearCookie, cookieValue, hashToken, newSessionToken, resolveSession, setCookie } from "../../src/auth/session";
import { startFakeIdp, type FakeIdp } from "../support/fakeIdp";

const CLIENT = "uw-client", SECRET = "s3cret-s3cret-s3cret", REDIRECT = "http://127.0.0.1:3000/api/auth/callback"; // secret-scan:allow (synthetic test value)
let idp: FakeIdp;
const cfg = (): OidcConfig => ({ issuer: idp.issuer, clientId: CLIENT, clientSecret: SECRET, redirectUri: REDIRECT });

beforeAll(async () => { idp = await startFakeIdp({ clientId: CLIENT, clientSecret: SECRET, redirectUri: REDIRECT, users: [{ sub: "sub-1", label: "Dana" }] }); });
afterAll(async () => { await idp.close(); });
beforeEach(() => { clearDiscoveryCache(); idp.misbehave = {}; });

/** Runs the real flow against the fake provider and returns the ID token it issues. */
async function getToken(nonce = "nonce-1"): Promise<{ idToken: string; keys: ReturnType<typeof createLocalJWKSet> }> {
  const meta = await discover(cfg());
  const { verifier, challenge } = pkce();
  const auth = authorizationUrl(meta, cfg(), { state: "st", nonce, challenge }) + "&fake_sub=sub-1";
  const r = await fetch(auth, { redirect: "manual" });
  const code = new URL(r.headers.get("location")!).searchParams.get("code")!;
  const idToken = await exchangeCode(meta, cfg(), code, verifier);
  return { idToken, keys: createLocalJWKSet({ keys: [idp.jwk] }) };
}
const reject = async (p: Promise<unknown>, code?: string) => { const e = await p.then(() => null, (x) => x); expect(e).toBeInstanceOf(AuthError); if (code) expect((e as AuthError).code).toBe(code); };

describe("discovery", () => {
  it("accepts a provider whose document names the configured issuer", async () => expect((await discover(cfg())).issuer).toBe(idp.issuer));
  it("rejects a document whose issuer differs from the configured one", async () => {
    await reject(discover({ ...cfg(), issuer: idp.issuer + "/" }), "issuer_mismatch");
  });
  it("refuses plain http to a non-loopback host", async () => reject(discover({ ...cfg(), issuer: "http://idp.example.com" }), "insecure_endpoint"));
  it("control: a loopback http provider is allowed outside production", async () => expect(await discover(cfg())).toBeTruthy());
});

describe("PKCE and authorization request", () => {
  it("challenge is base64url(sha256(verifier)) and the verifier is long enough", () => {
    const { verifier, challenge } = pkce();
    expect(verifier.length).toBeGreaterThanOrEqual(43);
    expect(challenge).toBe(createHash("sha256").update(verifier).digest("base64url"));
  });
  it("sends response_type code, S256, state, nonce and the exact redirect uri", async () => {
    const u = new URL(authorizationUrl(await discover(cfg()), cfg(), { state: "s", nonce: "n", challenge: "c" }));
    expect(Object.fromEntries(u.searchParams)).toMatchObject({ response_type: "code", code_challenge_method: "S256", state: "s", nonce: "n", redirect_uri: REDIRECT, client_id: CLIENT });
  });
  it("the provider rejects a wrong code verifier (PKCE is enforced end to end)", async () => {
    const meta = await discover(cfg());
    const { challenge } = pkce();
    const r = await fetch(authorizationUrl(meta, cfg(), { state: "s", nonce: "n", challenge }) + "&fake_sub=sub-1", { redirect: "manual" });
    const code = new URL(r.headers.get("location")!).searchParams.get("code")!;
    await reject(exchangeCode(meta, cfg(), code, pkce().verifier), "token_exchange_failed");
  });
  it("an authorization code works once", async () => {
    const meta = await discover(cfg());
    const { verifier, challenge } = pkce();
    const r = await fetch(authorizationUrl(meta, cfg(), { state: "s", nonce: "n", challenge }) + "&fake_sub=sub-1", { redirect: "manual" });
    const code = new URL(r.headers.get("location")!).searchParams.get("code")!;
    await exchangeCode(meta, cfg(), code, verifier);
    await reject(exchangeCode(meta, cfg(), code, verifier), "token_exchange_failed");
  });
  it("a wrong client secret is refused", async () => {
    const meta = await discover(cfg());
    await reject(exchangeCode(meta, { ...cfg(), clientSecret: "x".repeat(20) }, "code", "v"), "token_exchange_failed");
  });
});

describe("ID token validation", () => {
  it("accepts a correct token and returns subject, issuer and methods", async () => {
    const { idToken, keys } = await getToken();
    expect(await verifyIdToken(idToken, keys, cfg(), "nonce-1")).toEqual({ subject: "sub-1", issuer: idp.issuer, amr: ["pwd", "mfa"] });
  });
  const bad = async (m: Parameters<typeof Object.assign>[1], nonce = "nonce-1", c: Partial<OidcConfig> = {}) => {
    idp.misbehave = m; const { idToken, keys } = await getToken(nonce);
    return verifyIdToken(idToken, keys, { ...cfg(), ...c }, nonce);
  };
  it("rejects a token for another audience", async () => reject(bad({ claims: { aud: "someone-else" } }), "invalid_id_token"));
  it("rejects a token from another issuer", async () => reject(bad({ issuer: "https://evil.example" }), "invalid_id_token"));
  it("rejects an expired token", async () => reject(bad({ expiresIn: "-5m", issuedAt: Math.floor(Date.now() / 1000) - 600 }), "invalid_id_token"));
  it("rejects a token issued too long ago even if it has not expired", async () => reject(bad({ issuedAt: Math.floor(Date.now() / 1000) - 3600, expiresIn: "2h" }), "invalid_id_token"));
  it("rejects a token whose nonce differs from the one we sent", async () => {
    const { idToken, keys } = await getToken("nonce-1");
    await reject(verifyIdToken(idToken, keys, cfg(), "other-nonce"), "nonce_mismatch");
  });
  it("rejects a token without a nonce", async () => reject(bad({ claims: { nonce: undefined } }), "invalid_id_token"));
  it("rejects alg none", async () => reject(bad({ alg: "none" }), "invalid_id_token"));
  it("only asymmetric signature algorithms are on the allowlist (guard independent of the key type)", () => {
    expect([...ALLOWED_ALGS].sort()).toEqual(["ES256", "PS256", "RS256"]);
  });
  it("rejects an HS256 token (algorithm confusion)", async () => reject(bad({ alg: "HS256" }), "invalid_id_token"));
  it("rejects a token signed by a key the provider does not publish", async () => reject(bad({ foreignKey: true }), "invalid_id_token"));
  it("rejects a multi-audience token whose authorized party is not us", async () => reject(bad({ claims: { aud: [CLIENT, "other"], azp: "other" } }), "azp_mismatch"));
  it("enforces required authentication methods (for example MFA)", async () => {
    await reject(bad({ claims: { amr: ["pwd"] } }, "nonce-1", { requiredAmr: ["mfa"] }), "amr_missing");
    expect((await bad({ claims: { amr: ["pwd", "mfa"] } }, "nonce-1", { requiredAmr: ["mfa"] })).amr).toContain("mfa");
  });
});

describe("flow cookie", () => {
  const key = randomBytes(32);
  const f = { state: "s", nonce: "n", verifier: "v", returnTo: "/review", exp: Date.now() + 60_000 };
  it("round-trips", () => expect(openFlow(key, sealFlow(key, f))).toEqual(f));
  it("rejects tampering, a different key, and expiry", () => {
    const sealed = sealFlow(key, f);
    const t = Buffer.from(sealed, "base64url"); t[t.length - 1]! ^= 1;
    expect(openFlow(key, t.toString("base64url"))).toBeNull();
    expect(openFlow(randomBytes(32), sealed)).toBeNull();
    expect(openFlow(key, sealFlow(key, { ...f, exp: Date.now() - 1 }))).toBeNull();
    expect(openFlow(key, "garbage")).toBeNull();
  });
  it("only accepts same-site relative return paths", () => {
    expect(safeReturnTo("/review/abc?x=1")).toBe("/review/abc?x=1");
    for (const evil of ["https://evil.example", "//evil.example", "/\\evil.example", "javascript:alert(1)", "review", "/x\r\nSet-Cookie: a=b", "", null, undefined, "/" + "a".repeat(400)]) expect(safeReturnTo(evil as string)).toBe("/review");
  });
});

describe("sessions and cookies", () => {
  it("tokens are 256-bit random and only their hash is derived for storage", () => {
    const a = newSessionToken(), b = newSessionToken();
    expect(a.token).not.toBe(b.token);
    expect(Buffer.from(a.token, "base64url")).toHaveLength(32);
    expect(a.hash).toEqual(hashToken(a.token));
    expect(a.hash.toString("base64url")).not.toContain(a.token);
  });
  it("session cookies carry Secure, HttpOnly, SameSite=Lax, Path=/ and no Domain", () => {
    const c = setCookie("__Host-uw_session", "v", 60);
    expect(c).toContain("Secure"); expect(c).toContain("HttpOnly"); expect(c).toContain("SameSite=Lax"); expect(c).toContain("Path=/");
    expect(c).not.toMatch(/Domain=/i);
    expect(clearCookie("n")).toContain("Max-Age=0");
  });
  it("parses cookies by exact name", () => {
    expect(cookieValue("a=1; __Host-uw_session=tok; b=2", "__Host-uw_session")).toBe("tok");
    expect(cookieValue("x__Host-uw_session=tok", "__Host-uw_session")).toBeNull();
    expect(cookieValue(null, "a")).toBeNull();
  });
  it("a malformed token never reaches the database", async () => {
    const sql = (() => { throw new Error("database was called"); }) as never;
    expect(await resolveSession(sql, "short", 60)).toBeNull();
    expect(await resolveSession(sql, null, 60)).toBeNull();
    expect(await resolveSession(sql, "a'; drop table x;--" + "a".repeat(30), 60)).toBeNull();
  });
});

describe("role policy", () => {
  it("only an underwriter may decide; intake and builds need a processor or above; viewers only view", () => {
    expect(can("underwriter", "decide")).toBe(true);
    for (const r of ["viewer", "processor", "admin"] as const) expect(can(r, "decide"), r).toBe(false);
    expect(can("viewer", "intake")).toBe(false);
    expect(can("processor", "intake")).toBe(true);
    expect(can("viewer", "view")).toBe(true);
    expect(can(undefined, "view")).toBe(false);
  });
});
