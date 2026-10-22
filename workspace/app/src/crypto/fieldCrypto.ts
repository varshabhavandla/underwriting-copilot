import { createCipheriv, createDecipheriv, hkdfSync, randomBytes } from "node:crypto";

/**
 * Application-level encryption with a per-tenant data key (AES-256-GCM).
 * The KeyProvider seam is where a key-management service plugs in (D-013). LocalKeyProvider derives tenant keys from one
 * master key with HKDF and is for local development and tests only.
 */
export interface KeyProvider {
  dataKey(tenantId: string): Promise<Buffer>;
}

export class LocalKeyProvider implements KeyProvider {
  constructor(private readonly master: Buffer) {
    if (master.length < 32) throw new Error("master key must be at least 32 bytes");
  }
  async dataKey(tenantId: string): Promise<Buffer> {
    return Buffer.from(hkdfSync("sha256", this.master, Buffer.from(tenantId), Buffer.from("uw-field-key-v1"), 32));
  }
}

export function masterKeyFromEnv(env: Record<string, string | undefined> = process.env): Buffer {
  const b64 = env["FIELD_KEY_MASTER"];
  if (!b64) throw new Error("FIELD_KEY_MASTER is not set");
  const key = Buffer.from(b64, "base64");
  if (key.length < 32) throw new Error("FIELD_KEY_MASTER must decode to at least 32 bytes");
  return key;
}

const VERSION = 1;

/** Format: version(1) | iv(12) | tag(16) | ciphertext. `aad` binds the ciphertext to its tenant and field. */
export async function encrypt(keys: KeyProvider, tenantId: string, aad: string, plaintext: Buffer): Promise<Buffer> {
  const key = await keys.dataKey(tenantId);
  const iv = randomBytes(12);
  const c = createCipheriv("aes-256-gcm", key, iv);
  c.setAAD(Buffer.from(`${tenantId}|${aad}`));
  const ct = Buffer.concat([c.update(plaintext), c.final()]);
  return Buffer.concat([Buffer.from([VERSION]), iv, c.getAuthTag(), ct]);
}

export async function decrypt(keys: KeyProvider, tenantId: string, aad: string, blob: Buffer): Promise<Buffer> {
  if (blob.length < 29 || blob[0] !== VERSION) throw new Error("unsupported ciphertext");
  const key = await keys.dataKey(tenantId);
  const d = createDecipheriv("aes-256-gcm", key, blob.subarray(1, 13));
  d.setAAD(Buffer.from(`${tenantId}|${aad}`));
  d.setAuthTag(blob.subarray(13, 29));
  return Buffer.concat([d.update(blob.subarray(29)), d.final()]);
}
