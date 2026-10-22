import { readFileSync } from "node:fs";
import { join } from "node:path";
import postgres from "postgres";
import { connect, withTenant } from "../../src/db/client";
import { migrate } from "../../src/db/migrate";

export const withDb = (adminUrl: string, user: string, pass: string, name: string): string => {
  const u = new URL(adminUrl);
  u.username = user; u.password = pass; u.pathname = `/${name}`;
  return u.toString();
};

/** Fresh migrated database with one tenant and one underwriter. */
export async function setupDatabase(adminUrl: string, db: string, opts: { issuer?: string } = {}): Promise<{ tenant: string; user: string; staff: Record<string, string> }> {
  if (!/^[a-z0-9_]+$/.test(db)) throw new Error("invalid database name");
  const a = new URL(adminUrl);
  const root = postgres(withDb(adminUrl, a.username, a.password, "postgres"), { onnotice: () => {}, max: 1 });
  await root.unsafe(readFileSync(join(import.meta.dirname, "..", "..", "db", "bootstrap", "roles.sql"), "utf8"));
  await root.unsafe(`drop database if exists ${db} with (force)`);
  await root.unsafe(`create database ${db} owner uw_owner`);
  await root.end();
  const owner = connect(withDb(adminUrl, "uw_owner", "uw_owner_dev", db));
  await migrate(owner);
  const [t] = await owner<{ id: string }[]>`select gen_random_uuid() as id`;
  const tenant = t!.id;
  const staff: Record<string, string> = {};
  const user = await withTenant(owner, { tenantId: tenant }, async (tx) => {
    await tx`insert into tenants (id, name) values (${tenant}, 'Evaluation Community Bank')`;
    const [u] = await tx<{ id: string }[]>`insert into users (tenant_id, email, role) values (${tenant}, 'underwriter@eval.example', 'underwriter') returning id`;
    staff["underwriter"] = u!.id;
    if (opts.issuer) {
      for (const role of ["admin", "processor", "viewer"]) {
        const [x] = await tx<{ id: string }[]>`insert into users (tenant_id, email, role) values (${tenant}, ${`${role}@eval.example`}, ${role}) returning id`;
        staff[role] = x!.id;
      }
    }
    return u!.id;
  });
  if (opts.issuer) for (const [role, id] of Object.entries(staff)) await owner`insert into auth.identities (tenant_id, user_id, issuer, subject) values (${tenant}, ${id}, ${opts.issuer}, ${`sub-${role}`})`;
  await owner.end();
  return { tenant, user, staff };
}
