/**
 * Headers for serving a stored upload back to a person. There is no download route yet; the source-document viewer (B-129) must use this so a file can
 * never run as a page: always an attachment, a content type taken from our own detection (never from the uploader), nosniff, and a sandboxing policy.
 */
import type { DetectedType } from "./validateUpload";

const CONTENT_TYPE: Record<DetectedType, string> = { pdf: "application/pdf", png: "image/png", jpeg: "image/jpeg", text: "text/plain; charset=utf-8" };

/** A name that is safe to place in a header and to save to disk: no paths, no control characters, bounded length. */
export function safeDownloadName(name: string, type: DetectedType): string {
  const base = (name.split(/[\\/]/).pop() ?? "").replace(/[\u0000-\u001f\u007f"<>|:*?]/g, "_").replace(/^\.+/, "").slice(0, 120);
  const ext = type === "jpeg" ? ".jpg" : type === "text" ? ".txt" : `.${type}`;
  const stem = base.replace(/\.[A-Za-z0-9]{1,5}$/, "") || "document";
  return `${stem}${ext}`;
}

/** RFC 6266: an ASCII fallback plus an RFC 5987 encoded name, so no character can end the header value or start another header. */
export function downloadHeaders(name: string, type: DetectedType): Record<string, string> {
  const safe = safeDownloadName(name, type);
  const ascii = safe.replace(/[^\x20-\x7e]/g, "_").replace(/[\\"]/g, "_");
  const star = encodeURIComponent(safe).replace(/['()*]/g, (c) => "%" + c.charCodeAt(0).toString(16).toUpperCase());
  return {
    "content-type": CONTENT_TYPE[type],
    "content-disposition": `attachment; filename="${ascii}"; filename*=UTF-8''${star}`,
    "x-content-type-options": "nosniff",
    "content-security-policy": "sandbox; default-src 'none'",
    "cache-control": "no-store",
    "cross-origin-resource-policy": "same-origin",
  };
}
