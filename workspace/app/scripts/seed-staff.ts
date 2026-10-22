/** Adds the demo staff roles and links them to the fake identity provider's synthetic subjects. Development only. Usage: tsx scripts/seed-staff.ts <db> <issuer> */
import { connect, withTenant } from "../src/db/client";
import { withDb } from "./lib/setupDb";

const admin = process.env["UW_TEST_ADMIN_URL"];
const [db, issuer] = process.argv.slice(2);
if (!admin || !db || !issuer) throw new Error("usage: UW_TEST_ADMIN_URL=... tsx scripts/seed-staff.ts <db> <issuer>");
const a = new URL(admin);
const root = connect(withDb(admin, a.username, a.password, db)); // superuser, only to find the tenant (tenants are row-level protected)
const [t] = await root<{ id: string }[]>`select id from tenants limit 1`;
await root.end();
const owner = connect(withDb(admin, "uw_owner", "uw_owner_dev", db));
if (!t) throw new Error("no tenant in " + db);
await withTenant(owner, { tenantId: t.id }, async (tx) => {
  for (const role of ["admin", "processor", "underwriter", "viewer"]) {
    let [u] = await tx<{ id: string }[]>`select id from users where role = ${role} order by created_at limit 1`;
    if (!u) [u] = await tx<{ id: string }[]>`insert into users (tenant_id, email, role) values (${t.id}, ${`${role}@demo.example`}, ${role}) returning id`;
    await tx`insert into auth.identities (tenant_id, user_id, issuer, subject) values (${t.id}, ${u!.id}, ${issuer}, ${`sub-${role}`}) on conflict do nothing`;
  }
});
console.log(`TENANT=${t.id}`);
await owner.end();
