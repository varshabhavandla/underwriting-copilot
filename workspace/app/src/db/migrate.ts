import { readdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { createHash } from "node:crypto";
import type { Sql } from "./client";

const dir = join(dirname(fileURLToPath(import.meta.url)), "..", "..", "db", "migrations");

/** Forward-only SQL migrations, applied as the owner role. Each file runs once, in order; a changed file is an error. */
export async function migrate(owner: Sql): Promise<string[]> {
  await owner`create table if not exists schema_migrations (name text primary key, sha256 text not null, applied_at timestamptz not null default now())`;
  const applied: string[] = [];
  for (const file of readdirSync(dir).filter((f) => f.endsWith(".sql")).sort()) {
    const text = readFileSync(join(dir, file), "utf8");
    const sha = createHash("sha256").update(text).digest("hex");
    const [row] = await owner<{ sha256: string }[]>`select sha256 from schema_migrations where name = ${file}`;
    if (row) {
      if (row.sha256 !== sha) throw new Error(`migration ${file} was modified after being applied`);
      continue;
    }
    await owner.begin(async (tx) => {
      await tx.unsafe(text);
      await tx`insert into schema_migrations (name, sha256) values (${file}, ${sha})`;
    });
    applied.push(file);
  }
  return applied;
}
