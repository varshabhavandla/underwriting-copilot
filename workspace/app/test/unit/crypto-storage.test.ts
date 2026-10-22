import { mkdtempSync, readFileSync, readdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { randomBytes } from "node:crypto";
import { afterAll, describe, expect, it } from "vitest";
import { decrypt, encrypt, LocalKeyProvider, masterKeyFromEnv } from "../../src/crypto/fieldCrypto";
import { LocalObjectStore, objectKey, sha256Hex } from "../../src/storage/objectStore";
import { MAX_UPLOAD_BYTES, UploadRejected, validateUpload } from "../../src/storage/validateUpload";

const A = "11111111-1111-4111-8111-111111111111";
const B = "22222222-2222-4222-8222-222222222222";
const C1 = "33333333-3333-4333-8333-333333333333";
const keys = new LocalKeyProvider(randomBytes(32));

describe("field encryption", () => {
  it("round-trips for the owning tenant and field", async () => {
    const blob = await encrypt(keys, A, "ein", Buffer.from("12-3456789"));
    expect((await decrypt(keys, A, "ein", blob)).toString()).toBe("12-3456789");
  });
  it("does not store plaintext and differs per call (random IV)", async () => {
    const a = await encrypt(keys, A, "ein", Buffer.from("12-3456789"));
    const b = await encrypt(keys, A, "ein", Buffer.from("12-3456789"));
    expect(a.toString("latin1")).not.toContain("3456789");
    expect(a.equals(b)).toBe(false);
  });
  it("another tenant cannot decrypt (negative control: the owner can)", async () => {
    const blob = await encrypt(keys, A, "ein", Buffer.from("secret"));
    await expect(decrypt(keys, B, "ein", blob)).rejects.toThrow();
    expect((await decrypt(keys, A, "ein", blob)).toString()).toBe("secret");
  });
  it("is bound to the field name", async () => {
    const blob = await encrypt(keys, A, "ein", Buffer.from("x"));
    await expect(decrypt(keys, A, "other-field", blob)).rejects.toThrow();
  });
  it("detects tampering", async () => {
    const blob = await encrypt(keys, A, "f", Buffer.from("hello world"));
    blob[blob.length - 1] = (blob[blob.length - 1]! ^ 1) & 0xff;
    await expect(decrypt(keys, A, "f", blob)).rejects.toThrow();
  });
  it("requires a master key of at least 32 bytes", () => {
    expect(() => masterKeyFromEnv({})).toThrow(/not set/);
    expect(() => masterKeyFromEnv({ FIELD_KEY_MASTER: Buffer.alloc(8).toString("base64") })).toThrow(/32 bytes/);
    expect(() => new LocalKeyProvider(Buffer.alloc(8))).toThrow();
  });
});

describe("object store", () => {
  const root = mkdtempSync(join(tmpdir(), "uw-store-"));
  afterAll(() => rmSync(root, { recursive: true, force: true }));
  const store = new LocalObjectStore(root, keys);
  const bytes = Buffer.from("Net income: $210,000\nSECRET-MARKER");
  const sha = sha256Hex(bytes);
  const key = objectKey(A, C1, sha);

  it("stores encrypted bytes and reads them back", async () => {
    await store.put(A, key, bytes);
    const onDisk = readFileSync(join(root, A, C1, sha));
    expect(onDisk.toString("latin1")).not.toContain("SECRET-MARKER");
    expect((await store.get(A, key)).equals(bytes)).toBe(true);
  });
  it("refuses a key outside the tenant prefix, and path traversal", async () => {
    await expect(store.get(B, key)).rejects.toThrow(/outside tenant prefix/);
    await expect(store.get(A, `${A}/../${B}/x`)).rejects.toThrow();
    await expect(store.put(A, `${A}/../../etc/evil`, bytes)).rejects.toThrow();
  });
  it("never overwrites an existing object", async () => {
    await expect(store.put(A, key, Buffer.from("other"))).rejects.toThrow();
    expect(readdirSync(join(root, A, C1))).toEqual([sha]);
  });
  it("builds keys only from validated ids and hashes", () => {
    expect(() => objectKey("../x", C1, sha)).toThrow();
    expect(() => objectKey(A, C1, "nothex")).toThrow();
    expect(() => objectKey(A, C1, sha, "/../x")).toThrow();
  });
});

describe("upload validation", () => {
  it("accepts pdf, png, jpeg and utf-8 text by content", () => {
    expect(validateUpload(Buffer.from("%PDF-1.7\n..."))).toBe("pdf");
    expect(validateUpload(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0]))).toBe("png");
    expect(validateUpload(Buffer.from([0xff, 0xd8, 0xff, 0xe0, 1]))).toBe("jpeg");
    expect(validateUpload(Buffer.from("Gross receipts: $1,000"))).toBe("text");
  });
  it("rejects empty, oversized, executable and binary files", () => {
    expect(() => validateUpload(Buffer.alloc(0))).toThrow(UploadRejected);
    expect(() => validateUpload(Buffer.alloc(MAX_UPLOAD_BYTES + 1, 65))).toThrow(/too large/);
    expect(() => validateUpload(Buffer.from([0x4d, 0x5a, 0x90, 0x00, 0x03]))).toThrow(/unsupported/); // "MZ" executable header with NUL
    expect(() => validateUpload(Buffer.from([0xc3, 0x28]))).toThrow(/unsupported/); // invalid UTF-8
  });
  it("a .pdf name cannot make an executable pass: only content counts", () => {
    expect(() => validateUpload(Buffer.from([0x7f, 0x45, 0x4c, 0x46, 0x00]))).toThrow(UploadRejected);
  });
});
