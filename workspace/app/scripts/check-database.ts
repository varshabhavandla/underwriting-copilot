/**
 * Checks a hosted PostgreSQL (for example Neon) against the assumptions the isolation model depends on, without writing any data:
 *   - the application and owner roles can NOT bypass row-level security and are not superusers
 *   - the application role owns nothing
 *   - every table has row-level security enabled and forced
 *   - transaction-local tenant settings (set_config(..., true)) stay inside their transaction through the connection you give it, including a pooler
 *   - with no tenant set, or a tenant that does not exist, the tenants table shows nothing
 * Usage: APP_DATABASE_URL=postgres://uw_app:...@host/db [OWNER_DATABASE_URL=postgres://uw_owner:...@host/db] npx tsx scripts/check-database.ts
 * Run it against the pooled URL and the direct URL separately. Exit code 1 on any failure.
 */
import { randomUUID } from "node:crypto";
import { connect, withTenant, type Sql } from "../src/db/client";

let failed = 0;
const report = (ok: boolean, name: string, detail = "") => { console.log(`${ok ? "ok  " : "FAIL"} ${name}${ok || !detail ? "" : ` (${detail})`}`); if (!ok) failed++; };

async function roleChecks(sql: Sql, label: string): Promise<void> {
  const [r] = await sql<{ u: string; rolsuper: boolean; rolbypassrls: boolean }[]>`select current_user as u, rolsuper, rolbypassrls from pg_roles where rolname = current_user`;
  report(Boolean(r) && !r!.rolsuper, `${label} role ${r?.u} is not a superuser`);
  report(Boolean(r) && !r!.rolbypassrls, `${label} role ${r?.u} cannot bypass row-level security`, "BYPASSRLS is set: tenant isolation would not hold");
  const [m] = await sql<{ member: boolean }[]>`select exists (select 1 from pg_auth_members am join pg_roles g on g.oid = am.roleid where am.member = (select oid from pg_roles where rolname = current_user) and g.rolname in ('neon_superuser', 'rds_superuser', 'cloudsqlsuperuser', 'azure_pg_admin')) as member`;
  report(!m!.member, `${label} role is not a member of a provider superuser group`, "provider administrator groups can include BYPASSRLS");
}

const appUrl = process.env["APP_DATABASE_URL"], ownerUrl = process.env["OWNER_DATABASE_URL"];
if (!appUrl) throw new Error("set APP_DATABASE_URL (the application role's URL, pooled or direct)");
const app = connect(appUrl, 10);
try {
  await roleChecks(app, "application");
  const owned = await app`select tablename from pg_tables where schemaname = 'public' and tableowner = current_user`;
  report(owned.length === 0, "the application role owns no tables", owned.map((x) => x["tablename"]).join(","));
  const tables = await app<{ relname: string; relrowsecurity: boolean; relforcerowsecurity: boolean }[]>`
    select c.relname, c.relrowsecurity, c.relforcerowsecurity from pg_class c join pg_namespace n on n.oid = c.relnamespace where n.nspname = 'public' and c.relkind = 'r' and c.relname <> 'schema_migrations'`;
  report(tables.length >= 7, `migrations are applied (${tables.length} tables)`, "run the migrations as the owner role first");
  const weak = tables.filter((t) => !t.relrowsecurity || !t.relforcerowsecurity).map((t) => t.relname);
  report(weak.length === 0, "row-level security is enabled and forced on every table", weak.join(","));

  // transaction-local settings must not leak between transactions, even when a pooler multiplexes them over shared connections
  const N = 300, CONCURRENCY = 25;
  let mismatches = 0, leaks = 0, done = 0;
  const one = async () => {
    const mine = randomUUID();
    await app.begin(async (tx) => {
      await tx`select set_config('app.tenant_id', ${mine}, true)`;
      await tx`select pg_sleep(${Math.random() * 0.02})`;
      const [a] = await tx<{ v: string }[]>`select current_setting('app.tenant_id', true) as v`;
      if (a!.v !== mine) mismatches++;
    });
    const [b] = await app<{ v: string | null }[]>`select nullif(current_setting('app.tenant_id', true), '') as v`;
    if (b!.v !== null) leaks++;
    done++;
  };
  const queue = Array.from({ length: N }, () => one);
  await Promise.all(Array.from({ length: CONCURRENCY }, async () => { for (let f = queue.shift(); f; f = queue.shift()) await f(); }));
  report(mismatches === 0, `tenant setting read back correctly inside ${N} concurrent transactions`, `${mismatches} mismatches`);
  report(leaks === 0, `tenant setting never visible after commit (${N} checks)`, `${leaks} leaks: a pooled connection kept the setting`);

  const none = await app<{ n: number }[]>`select count(*)::int as n from tenants`;
  report(none[0]!.n === 0, "with no tenant set, the tenants table is empty", `${none[0]!.n} rows visible`);
  const ghost = await withTenant(app, { tenantId: randomUUID() }, (tx) => tx<{ n: number }[]>`select count(*)::int as n from tenants`);
  report(ghost[0]!.n === 0, "with a tenant id that does not exist, the tenants table is empty");
  const [fn] = await app<{ ok: boolean }[]>`select has_function_privilege(current_user, 'auth.resolve_session(bytea, interval)', 'execute') as ok`;
  report(fn!.ok, "the application role can execute the sign-in functions");
  await app`select * from auth.sessions limit 1`.then(() => report(false, "the application role cannot read the session table", "it can"), () => report(true, "the application role cannot read the session table"));
} finally {
  await app.end();
}
if (ownerUrl) {
  const owner = connect(ownerUrl, 2);
  try { await roleChecks(owner, "owner"); } finally { await owner.end(); }
} else console.log("skip owner role checks (OWNER_DATABASE_URL not set)");
console.log(failed === 0 ? "check-database: OK" : `check-database: ${failed} FAILED`);
process.exit(failed === 0 ? 0 : 1);
