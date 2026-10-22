export const MAX_UPLOAD_BYTES = 4 * 1024 * 1024; // below the 4.5 MB hosting body limit; production uploads go directly to storage
export type DetectedType = "pdf" | "png" | "jpeg" | "text";

export class UploadRejected extends Error {}

/** Type is decided by content, never by file name or declared MIME type. */
export function detectType(bytes: Buffer): DetectedType | null {
  if (bytes.subarray(0, 5).toString("latin1") === "%PDF-") return "pdf";
  if (bytes.length > 8 && bytes.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return "png";
  if (bytes.length > 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return "jpeg";
  if (bytes.length > 0 && !bytes.includes(0)) {
    try {
      new TextDecoder("utf-8", { fatal: true }).decode(bytes);
      return "text";
    } catch {
      return null;
    }
  }
  return null;
}

export function validateUpload(bytes: Buffer): DetectedType {
  if (bytes.length === 0) throw new UploadRejected("empty file");
  if (bytes.length > MAX_UPLOAD_BYTES) throw new UploadRejected("file too large");
  const t = detectType(bytes);
  if (!t) throw new UploadRejected("unsupported file type");
  return t;
}
