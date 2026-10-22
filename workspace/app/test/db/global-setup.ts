import { readFileSync } from "node:fs";
import { join } from "node:path";
import postgres from "postgres";
import { migrate } from "../../src/db/migrate";
import { dbEnabled, urls } from "./urls";

/** Fresh database every run: roles, then migrations as the owner role. Skipped when no test database is configured. */
export default async function setup(): Promise<void> {
  if (!dbEnabled) return;
  const admin = postgres(urls.admin(), { onnotice: () => {}, max: 1 });
  try {
    await admin.unsafe(readFileSync(join(import.meta.dirname, "..", "..", "db", "bootstrap", "roles.sql"), "utf8"));
    await admin.unsafe(`drop database if exists ${urls.dbName} with (force)`);
    await admin.unsafe(`create database ${urls.dbName} owner uw_owner`);
  } finally {
    await admin.end();
  }
  const owner = postgres(urls.owner(), { onnotice: () => {}, max: 1 });
  try {
    await migrate(owner);
  } finally {
    await owner.end();
  }
}
