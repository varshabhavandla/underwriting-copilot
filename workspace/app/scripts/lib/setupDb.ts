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
export async function setupDatabase(adminUrl: string, db: string): Promise<{ tenant: string; user: string }> {
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
  const user = await withTenant(owner, { tenantId: tenant }, async (tx) => {
    await tx`insert into tenants (id, name) values (${tenant}, 'Evaluation Community Bank')`;
    const [u] = await tx<{ id: string }[]>`insert into users (tenant_id, email, role) values (${tenant}, 'underwriter@eval.example', 'underwriter') returning id`;
    return u!.id;
  });
  await owner.end();
  return { tenant, user };
}
