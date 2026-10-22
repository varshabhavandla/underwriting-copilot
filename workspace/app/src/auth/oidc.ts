/**
 * OpenID Connect relying party: authorization code flow with PKCE (S256), state and nonce, strict ID token validation.
 * Authentication, passwords and MFA are the identity provider's job; we only decide whether to trust its assertion and map it to a user we
 * provisioned. Who someone is (tenant, role) comes from our database, never from token claims.
 */
import { createHash, randomBytes } from "node:crypto";
import { createLocalJWKSet, errors, jwtVerify, type JSONWebKeySet, type JWTVerifyGetKey } from "jose";
import { fetchPublic, UnsafeUrl, type Fetched } from "./safeFetch";

export interface OidcConfig {
  issuer: string;
  clientId: string;
  clientSecret?: string | undefined;
  redirectUri: string;
  scopes?: string;
  requiredAmr?: string[];
}
export interface OidcMetadata { issuer: string; authorization_endpoint: string; token_endpoint: string; jwks_uri: string }
export class AuthError extends Error { constructor(public readonly code: string, message?: string) { super(message ?? code); } }

/** Only these signature algorithms are accepted; "none" and symmetric algorithms are never allowed. */
export const ALLOWED_ALGS = ["RS256", "PS256", "ES256"] as const;
const b64url = (b: Buffer) => b.toString("base64url");
const TIMEOUT_MS = 5000;

const cache = new Map<string, { at: number; meta: OidcMetadata }>();
type Get = (url: string, init?: RequestInit) => Promise<Fetched>;
const asAuthError = async <T>(p: Promise<T>, code: string): Promise<T> => p.catch((e) => { throw e instanceof AuthError ? e : new AuthError(code, e instanceof UnsafeUrl ? e.message : undefined); });

export async function discover(cfg: OidcConfig, get: Get = fetchPublic, now = Date.now()): Promise<OidcMetadata> {
  const hit = cache.get(cfg.issuer);
  if (hit && now - hit.at < 3_600_000) return hit.meta;
  const base = cfg.issuer.replace(/\/$/, "");
  const res = await asAuthError(get(`${base}/.well-known/openid-configuration`), "insecure_endpoint");
  if (!res.ok) throw new AuthError("discovery_failed");
  const m = res.json() as Partial<OidcMetadata>;
  // RFC 8414 / OIDC Discovery: the issuer in the document must equal the one we configured, or a malicious server could impersonate another
  if (m.issuer !== cfg.issuer) throw new AuthError("issuer_mismatch");
  for (const k of ["authorization_endpoint", "token_endpoint", "jwks_uri"] as const) {
    if (typeof m[k] !== "string") throw new AuthError("discovery_incomplete");
    if (!/^https:\/\//.test(m[k]!) && !(process.env["NODE_ENV"] !== "production" && /^http:\/\/(127\.0\.0\.1|localhost)[:/]/.test(m[k]!))) throw new AuthError("insecure_endpoint", `${k} must be https`);
  }
  const meta = m as OidcMetadata;
  cache.set(cfg.issuer, { at: now, meta });
  return meta;
}
export const clearDiscoveryCache = (issuer?: string) => { if (issuer) cache.delete(issuer); else cache.clear(); };

export function pkce(): { verifier: string; challenge: string } {
  const verifier = b64url(randomBytes(32));
  return { verifier, challenge: b64url(createHash("sha256").update(verifier).digest()) };
}
export const randomToken = (bytes = 24) => b64url(randomBytes(bytes));

export function authorizationUrl(meta: OidcMetadata, cfg: OidcConfig, p: { state: string; nonce: string; challenge: string }): string {
  const u = new URL(meta.authorization_endpoint);
  u.search = new URLSearchParams({
    response_type: "code", client_id: cfg.clientId, redirect_uri: cfg.redirectUri, scope: cfg.scopes ?? "openid email",
    state: p.state, nonce: p.nonce, code_challenge: p.challenge, code_challenge_method: "S256",
  }).toString();
  return u.toString();
}

export async function exchangeCode(meta: OidcMetadata, cfg: OidcConfig, code: string, verifier: string, get: Get = fetchPublic): Promise<string> {
  const body = new URLSearchParams({ grant_type: "authorization_code", code, redirect_uri: cfg.redirectUri, code_verifier: verifier, client_id: cfg.clientId });
  const headers: Record<string, string> = { "content-type": "application/x-www-form-urlencoded", accept: "application/json" };
  if (cfg.clientSecret) headers["authorization"] = "Basic " + Buffer.from(`${encodeURIComponent(cfg.clientId)}:${encodeURIComponent(cfg.clientSecret)}`).toString("base64");
  const res = await asAuthError(get(meta.token_endpoint, { method: "POST", body, headers }), "token_exchange_failed");
  if (!res.ok) throw new AuthError("token_exchange_failed");
  const j = res.json() as { id_token?: unknown; token_type?: unknown };
  if (typeof j.id_token !== "string" || j.id_token.length > 16_384) throw new AuthError("no_id_token");
  return j.id_token;
}

export interface VerifiedIdentity { subject: string; issuer: string; amr: string[] }

/** Validates signature (allowed algorithms, provider keys only), issuer, audience, expiry, issued-at age, nonce, authorized party and required methods. */
export async function verifyIdToken(
  idToken: string, keys: JWTVerifyGetKey, cfg: OidcConfig, expectedNonce: string, now: Date = new Date(),
): Promise<VerifiedIdentity> {
  try {
    const { payload } = await jwtVerify(idToken, keys, {
      issuer: cfg.issuer, audience: cfg.clientId, algorithms: [...ALLOWED_ALGS], clockTolerance: 60, maxTokenAge: "10m",
      requiredClaims: ["sub", "exp", "iat", "nonce"], currentDate: now,
    });
    if (payload["nonce"] !== expectedNonce) throw new AuthError("nonce_mismatch");
    if (Array.isArray(payload.aud) && payload.aud.length > 1 && payload["azp"] !== cfg.clientId) throw new AuthError("azp_mismatch");
    if (typeof payload.sub !== "string" || payload.sub.length === 0 || payload.sub.length > 255) throw new AuthError("bad_subject");
    const amr = Array.isArray(payload["amr"]) ? (payload["amr"] as unknown[]).filter((x): x is string => typeof x === "string") : [];
    for (const need of cfg.requiredAmr ?? []) if (!amr.includes(need)) throw new AuthError("amr_missing");
    return { subject: payload.sub, issuer: cfg.issuer, amr };
  } catch (e) {
    if (e instanceof AuthError) throw e;
    if (e instanceof errors.JOSEError) throw new AuthError("invalid_id_token", e.code);
    throw e;
  }
}

const jwksCache = new Map<string, { at: number; set: JSONWebKeySet }>();
const lastForced = new Map<string, number>();
export const clearKeyCache = () => { jwksCache.clear(); lastForced.clear(); };
const JWKS_TTL_MS = 3_600_000, JWKS_COOLDOWN_MS = 30_000;

async function loadKeys(uri: string, get: Get, now: number): Promise<JSONWebKeySet> {
  const res = await asAuthError(get(uri), "jwks_fetch_failed");
  if (!res.ok) throw new AuthError("jwks_fetch_failed");
  const j = res.json() as JSONWebKeySet;
  if (!Array.isArray(j.keys) || j.keys.length > 20) throw new AuthError("jwks_invalid");
  jwksCache.set(uri, { at: now, set: j });
  return j;
}

/**
 * Provider keys, fetched through the same guarded client as everything else, cached for an hour. An unknown key id (a provider rotating keys) triggers
 * one refetch, at most once per 30 seconds per provider, so a stream of forged key ids cannot make us hammer the provider.
 */
export function keysFor(meta: OidcMetadata, get: Get = fetchPublic): JWTVerifyGetKey {
  return async (header, token) => {
    const now = Date.now();
    const cached = jwksCache.get(meta.jwks_uri);
    const set = cached && now - cached.at < JWKS_TTL_MS ? cached.set : await loadKeys(meta.jwks_uri, get, now);
    try {
      return await createLocalJWKSet(set)(header, token);
    } catch (e) {
      if (!(e instanceof errors.JWKSNoMatchingKey)) throw e;
      if (now - (lastForced.get(meta.jwks_uri) ?? 0) < JWKS_COOLDOWN_MS) throw e;
      lastForced.set(meta.jwks_uri, now);
      return await createLocalJWKSet(await loadKeys(meta.jwks_uri, get, now))(header, token);
    }
  };
}
