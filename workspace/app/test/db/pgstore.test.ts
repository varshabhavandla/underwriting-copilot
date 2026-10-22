import { randomBytes, randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { LocalKeyProvider } from "../../src/crypto/fieldCrypto";
import { connect, withTenant, type Sql } from "../../src/db/client";
import { objectKey, PgObjectStore, sha256Hex } from "../../src/storage/objectStore";
import { dbEnabled, urls } from "./urls";

describe.skipIf(!dbEnabled)("database-backed object store (real Postgres)", () => {
  let owner: Sql, app: Sql, store: PgObjectStore;
  const T: Record<string, string> = {};
  const keys = new LocalKeyProvider(randomBytes(32));
  beforeAll(async () => {
    owner = connect(urls.owner()); app = connect(urls.app()); store = new PgObjectStore(app, keys);
    for (const tag of ["a", "b"]) { T[tag] = randomUUID(); await withTenant(owner, { tenantId: T[tag]! }, (tx) => tx`insert into tenants (id, name) values (${T[tag]!}, ${tag})`); }
  });
  afterAll(async () => { await Promise.all([owner.end(), app.end()]); });
  const keyFor = (tag: string, bytes: Buffer) => objectKey(T[tag]!, randomUUID(), sha256Hex(bytes));

  it("round-trips, and what is stored is ciphertext", async () => {
    const bytes = Buffer.from("Net income: $120,000 confidential");
    const key = keyFor("a", bytes);
    await store.put(T["a"]!, key, bytes);
    expect((await store.get(T["a"]!, key)).equals(bytes)).toBe(true);
    const [row] = await withTenant(owner, { tenantId: T["a"]! }, (tx) => tx<{ ciphertext: Buffer }[]>`select ciphertext from stored_objects where key = ${key}`);
    expect(row!.ciphertext.toString("latin1")).not.toContain("Net income");
  });
  it("refuses to overwrite: a second put of the same key reports EEXIST and the first object is unchanged", async () => {
    const bytes = Buffer.from("first"), key = keyFor("a", bytes);
    await store.put(T["a"]!, key, bytes);
    await expect(store.put(T["a"]!, key, Buffer.from("second"))).rejects.toThrow(/EEXIST/);
    expect((await store.get(T["a"]!, key)).toString()).toBe("first");
  });
  it("one tenant cannot read or write under another tenant's prefix, and row-level security hides foreign rows", async () => {
    const bytes = Buffer.from("tenant a secret"), key = keyFor("a", bytes);
    await store.put(T["a"]!, key, bytes);
    await expect(store.get(T["b"]!, key)).rejects.toThrow(/outside tenant prefix/);
    await expect(store.put(T["b"]!, key, bytes)).rejects.toThrow(/outside tenant prefix/);
    const seen = await withTenant(app, { tenantId: T["b"]! }, (tx) => tx`select key from stored_objects where key = ${key}`);
    expect(seen).toHaveLength(0);
    await expect(withTenant(app, { tenantId: T["b"]! }, (tx) => tx`insert into stored_objects (tenant_id, key, ciphertext) values (${T["a"]!}, ${key + "x"}, ${Buffer.from("x")})`)).rejects.toThrow();
  });
  it("a missing object is an error, and a ciphertext moved to another key does not decrypt", async () => {
    await expect(store.get(T["a"]!, keyFor("a", Buffer.from("never stored")))).rejects.toThrow(/not found/);
    const bytes = Buffer.from("bound to its key"), key = keyFor("a", bytes), other = keyFor("a", Buffer.from("other"));
    await store.put(T["a"]!, key, bytes);
    const [r] = await withTenant(owner, { tenantId: T["a"]! }, (tx) => tx<{ ciphertext: Buffer }[]>`select ciphertext from stored_objects where key = ${key}`);
    await withTenant(owner, { tenantId: T["a"]! }, (tx) => tx`insert into stored_objects (tenant_id, key, ciphertext) values (${T["a"]!}, ${other}, ${r!.ciphertext})`);
    await expect(store.get(T["a"]!, other)).rejects.toThrow();
  });
  it("objects are write-once: neither role can update or delete", async () => {
    const bytes = Buffer.from("immutable"), key = keyFor("a", bytes);
    await store.put(T["a"]!, key, bytes);
    await expect(withTenant(app, { tenantId: T["a"]! }, (tx) => tx`update stored_objects set ciphertext = ${Buffer.from("x")} where key = ${key}`)).rejects.toThrow();
    await expect(withTenant(app, { tenantId: T["a"]! }, (tx) => tx`delete from stored_objects where key = ${key}`)).rejects.toThrow();
    await expect(withTenant(owner, { tenantId: T["a"]! }, (tx) => tx`delete from stored_objects where key = ${key}`)).rejects.toThrow(/append-only/);
  });
  it("enforces the 5 MB row cap", async () => {
    await expect(withTenant(owner, { tenantId: T["a"]! }, (tx) => tx`insert into stored_objects (tenant_id, key, ciphertext) values (${T["a"]!}, ${"k".repeat(60)}, ${Buffer.alloc(5 * 1024 * 1024 + 1)})`)).rejects.toThrow(/check/);
  });
});
