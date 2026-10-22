/** Per-organization single sign-on settings, administered by the organization's own admin. */
import { encrypt } from "../crypto/fieldCrypto";
import type { KeyProvider } from "../crypto/fieldCrypto";
import { IDP_SECRET_FIELD } from "../auth/idp";
import { AuthError, clearDiscoveryCache, discover, type OidcConfig } from "../auth/oidc";
import { withTenant, type Sql, type TenantContext } from "../db/client";
import type { Outcome } from "./actions";

type Ctx = TenantContext & { userId: string };
export interface MyIdp { slug: string; issuer: string | null; client_id: string | null; has_secret: boolean; required_amr: string[]; enabled: boolean }

export async function getMyIdp(sql: Sql, ctx: Ctx): Promise<MyIdp | null> {
  const rows = await withTenant(sql, ctx, (tx) => tx<MyIdp[]>`select * from auth.get_my_idp()`);
  return rows[0] ?? null;
}

const AMR = /^[a-z0-9_-]{1,30}$/;
/** In production the issuer must be https; loopback http exists only for the local fake provider. */
export const issuerAllowed = (issuer: string, production = process.env["NODE_ENV"] === "production"): boolean =>
  /^https:\/\/[^\s/]+(\/\S*)?$/.test(issuer) || (!production && /^http:\/\/(127\.0\.0\.1|localhost)(:\d+)?(\/\S*)?$/.test(issuer));

export async function configureIdp(
  sql: Sql, keys: KeyProvider, ctx: Ctx,
  input: { issuer: string; clientId: string; clientSecret: string; requiredAmr: string; enabled: boolean },
): Promise<Outcome> {
  const issuer = input.issuer.trim().replace(/\/+$/, "");
  const clientId = input.clientId.trim();
  const amr = input.requiredAmr.split(",").map((x) => x.trim().toLowerCase()).filter(Boolean);
  if (!issuerAllowed(issuer)) return { ok: false, message: "the issuer must be an https URL" };
  if (!clientId || clientId.length > 255) return { ok: false, message: "enter the client id" };
  if (amr.length > 5 || amr.some((a) => !AMR.test(a))) return { ok: false, message: "required authentication methods: up to five short names such as mfa" };
  if (input.clientSecret && input.clientSecret.length < 16) return { ok: false, message: "the client secret looks too short" };
  const enc = input.clientSecret ? await encrypt(keys, ctx.tenantId, IDP_SECRET_FIELD, Buffer.from(input.clientSecret, "utf8")) : null;
  try {
    await withTenant(sql, ctx, (tx) => tx`select auth.configure_idp(${issuer}, ${clientId}, ${enc}, ${amr}, ${input.enabled})`);
    return { ok: true, message: input.enabled ? "Single sign-on saved and enabled" : "Single sign-on saved (disabled)" };
  } catch (e) {
    const code = (e as { code?: string }).code;
    if (code === "42501" || code === "22023") return { ok: false, message: (e as Error).message };
    if (code === "23505") return { ok: false, message: "that identity provider is already used by another organization" };
    if (code === "23514") return { ok: false, message: "to enable single sign-on, set the issuer, client id and client secret first" };
    throw e;
  }
}

/** Checks that the issuer answers with a valid discovery document naming itself, through the same guarded client used at sign-in. */
export async function testIdp(cfg: Pick<OidcConfig, "issuer">): Promise<Outcome> {
  try {
    clearDiscoveryCache(cfg.issuer); // always ask the provider, not our cache
    const meta = await discover({ issuer: cfg.issuer, clientId: "x", redirectUri: "https://x.invalid" });
    return { ok: true, message: `The provider answered and identifies itself as ${meta.issuer}` };
  } catch (e) {
    if (e instanceof AuthError) return { ok: false, message: `The provider did not pass the check (${e.code})` };
    throw e;
  }
}
