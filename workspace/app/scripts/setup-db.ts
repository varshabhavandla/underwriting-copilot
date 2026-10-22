/** Creates a fresh, migrated database with one tenant and one underwriter. Prints TENANT=<id> and USER=<id>. Usage: tsx scripts/setup-db.ts <dbname> */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import postgres from "postgres";
import { connect, withTenant } from "../src/db/client";
import { migrate } from "../src/db/migrate";

const admin = process.env["UW_TEST_ADMIN_URL"];
const db = process.argv[2];
if (!admin || !db || !/^[a-z0-9_]+$/.test(db)) throw new Error("usage: UW_TEST_ADMIN_URL=... tsx scripts/setup-db.ts <dbname>");
const withDb = (user: string, pass: string, name: string) => {
  const u = new URL(admin);
  u.username = user; u.password = pass; u.pathname = `/${name}`;
  return u.toString();
};
const root = postgres(withDb(new URL(admin).username, new URL(admin).password, "postgres"), { onnotice: () => {}, max: 1 });
await root.unsafe(readFileSync(join(import.meta.dirname, "..", "db", "bootstrap", "roles.sql"), "utf8"));
await root.unsafe(`drop database if exists ${db} with (force)`);
await root.unsafe(`create database ${db} owner uw_owner`);
await root.end();
const owner = connect(withDb("uw_owner", "uw_owner_dev", db));
await migrate(owner);
const [t] = await owner<{ id: string }[]>`select gen_random_uuid() as id`;
const tenant = t!.id;
const user = await withTenant(owner, { tenantId: tenant }, async (tx) => {
  await tx`insert into tenants (id, name) values (${tenant}, 'E2E Community Bank')`;
  const [u] = await tx<{ id: string }[]>`insert into users (tenant_id, email, role) values (${tenant}, 'underwriter@e2e.example', 'underwriter') returning id`;
  return u!.id;
});
await owner.end();
console.log(`TENANT=${tenant}\nUSER=${user}`);
