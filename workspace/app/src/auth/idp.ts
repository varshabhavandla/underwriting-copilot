import { decrypt } from "../crypto/fieldCrypto";
import type { KeyProvider } from "../crypto/fieldCrypto";
import type { Sql } from "../db/client";
import type { OidcConfig } from "./oidc";

/** AAD label binding a stored client secret to its tenant and purpose. */
export const IDP_SECRET_FIELD = "idp_client_secret";
const SLUG = /^[a-z0-9][a-z0-9-]{1,38}[a-z0-9]$/;
export const isSlug = (s: string): boolean => SLUG.test(s);

/** Looks up an organization's provider before anyone is signed in. Returns null for an unknown, disabled or incomplete organization (callers must not say which). */
export async function loadTenantIdp(sql: Sql, keys: KeyProvider, slug: string, redirectUri: string): Promise<(OidcConfig & { tenantId: string }) | null> {
  const s = slug.trim().toLowerCase();
  if (!isSlug(s)) return null;
  const rows = await sql<{ tenant_id: string; issuer: string; client_id: string; client_secret_enc: Buffer; required_amr: string[] }[]>`select * from auth.idp_for_slug(${s})`;
  const r = rows[0];
  if (!r) return null;
  const secret = (await decrypt(keys, r.tenant_id, IDP_SECRET_FIELD, r.client_secret_enc)).toString("utf8");
  return { tenantId: r.tenant_id, issuer: r.issuer, clientId: r.client_id, clientSecret: secret, redirectUri, requiredAmr: r.required_amr };
}
