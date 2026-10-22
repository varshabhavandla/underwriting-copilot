/**
 * Operator tool: creates an organization (tenant) with its sign-in name, optionally its identity provider, and its first admin. This is the only way the
 * first admin and the organization name come into being; tenant admins cannot claim names. Runs with the database owner role, so keep it off the web path.
 *
 * Usage:
 *   OWNER_DATABASE_URL=postgres://uw_owner:...@host/db FIELD_KEY_MASTER=... tsx scripts/provision-tenant.ts \ secret-scan:allow (placeholder)
 *     --name "First Community Bank" --slug first-community-bank --admin-email admin@bank.example \
 *     [--issuer https://login.bank.example --client-id ID --client-secret SECRET --admin-sub PROVIDER_SUBJECT]
 */
import { IDP_SECRET_FIELD, isSlug } from "../src/auth/idp";
import { encrypt, LocalKeyProvider, masterKeyFromEnv } from "../src/crypto/fieldCrypto";
import { connect, withTenant } from "../src/db/client";

function args(): Record<string, string> {
  const out: Record<string, string> = {};
  const a = process.argv.slice(2);
  for (let i = 0; i < a.length; i += 2) {
    const k = a[i];
    if (!k?.startsWith("--") || a[i + 1] === undefined) throw new Error(`bad argument near ${k}`);
    out[k.slice(2)] = a[i + 1]!;
  }
  return out;
}
const o = args();
const url = process.env["OWNER_DATABASE_URL"];
if (!url) throw new Error("set OWNER_DATABASE_URL (the database owner role)");
for (const need of ["name", "slug", "admin-email"]) if (!o[need]) throw new Error(`--${need} is required`);
if (!isSlug(o["slug"]!)) throw new Error("--slug must be 3 to 40 characters: lowercase letters, digits and hyphens, not starting or ending with a hyphen");
const idpArgs = ["issuer", "client-id", "client-secret"].filter((k) => o[k]);
if (idpArgs.length !== 0 && idpArgs.length !== 3) throw new Error("give all of --issuer, --client-id and --client-secret, or none");

const owner = connect(url);
const [t] = await owner<{ id: string }[]>`select gen_random_uuid() as id`;
const tenant = t!.id;
const keys = new LocalKeyProvider(masterKeyFromEnv());
const enc = o["client-secret"] ? await encrypt(keys, tenant, IDP_SECRET_FIELD, Buffer.from(o["client-secret"], "utf8")) : null;
const adminId = await withTenant(owner, { tenantId: tenant }, async (tx) => {
  await tx`insert into tenants (id, name) values (${tenant}, ${o["name"]!})`;
  const [u] = await tx<{ id: string }[]>`insert into users (tenant_id, email, role) values (${tenant}, ${o["admin-email"]!.toLowerCase()}, 'admin') returning id`;
  await tx`insert into auth.tenant_idps (tenant_id, slug, issuer, client_id, client_secret_enc, enabled)
           values (${tenant}, ${o["slug"]!}, ${o["issuer"] ?? null}, ${o["client-id"] ?? null}, ${enc}, ${Boolean(enc)})`;
  if (o["issuer"] && o["admin-sub"]) await tx`insert into auth.identities (tenant_id, user_id, issuer, subject) values (${tenant}, ${u!.id}, ${o["issuer"]}, ${o["admin-sub"]})`;
  return u!.id;
});
await owner.end();
console.log(`TENANT=${tenant}\nADMIN=${adminId}\nSIGN_IN_NAME=${o["slug"]}`);
