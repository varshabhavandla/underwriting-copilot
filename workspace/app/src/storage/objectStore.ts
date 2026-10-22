import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, relative, resolve } from "node:path";
import { decrypt, encrypt, type KeyProvider } from "../crypto/fieldCrypto";

/** Object keys are built only by this function: tenant/case/sha256. No caller-supplied path segments. */
export function objectKey(tenantId: string, caseId: string, sha256: string, suffix = ""): string {
  const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  if (!uuid.test(tenantId) || !uuid.test(caseId)) throw new Error("invalid id in object key");
  if (!/^[0-9a-f]{64}$/.test(sha256)) throw new Error("invalid hash in object key");
  if (suffix && !/^\.[a-z.]{1,16}$/.test(suffix)) throw new Error("invalid suffix");
  return `${tenantId}/${caseId}/${sha256}${suffix}`;
}

export interface ObjectStore {
  put(tenantId: string, key: string, bytes: Buffer): Promise<void>;
  get(tenantId: string, key: string): Promise<Buffer>;
}

/** Local disk implementation: files are encrypted with the tenant key. Production uses a managed bucket (D-013). */
export class LocalObjectStore implements ObjectStore {
  constructor(private readonly root: string, private readonly keys: KeyProvider) {}

  private path(tenantId: string, key: string): string {
    if (!key.startsWith(`${tenantId}/`)) throw new Error("key outside tenant prefix");
    const root = resolve(this.root);
    const full = resolve(root, key);
    const rel = relative(root, full);
    if (rel.startsWith("..") || rel === "" || resolve(root, rel) !== full) throw new Error("path escapes store root");
    return full;
  }

  async put(tenantId: string, key: string, bytes: Buffer): Promise<void> {
    const p = this.path(tenantId, key);
    await mkdir(dirname(p), { recursive: true });
    await writeFile(p, await encrypt(this.keys, tenantId, key, bytes), { flag: "wx" });
  }

  async get(tenantId: string, key: string): Promise<Buffer> {
    return decrypt(this.keys, tenantId, key, await readFile(this.path(tenantId, key)));
  }
}

export function sha256Hex(bytes: Buffer): string {
  return createHash("sha256").update(bytes).digest("hex");
}
