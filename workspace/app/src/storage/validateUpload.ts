export const MAX_UPLOAD_BYTES = 4 * 1024 * 1024; // below the 4.5 MB hosting body limit; production uploads go directly to storage
export type DetectedType = "pdf" | "png" | "jpeg" | "text";

export class UploadRejected extends Error {}

/** File name endings accepted for each detected content type. The name is checked against the content, never the other way round. */
export const ALLOWED_EXTENSIONS: Record<DetectedType, readonly string[]> = {
  pdf: [".pdf"],
  png: [".png"],
  jpeg: [".jpg", ".jpeg"],
  text: [".txt", ".csv"],
};

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

/** PDF names that run code, open other files or reach the network. PDF name escapes (#61 for "a") are decoded first so they cannot hide a name. */
const PDF_ACTIVE = /\/(JavaScript|JS|Launch|OpenAction|AA|RichMedia|EmbeddedFile|EmbeddedFiles|XFA|SubmitForm|ImportData|GoToR|GoToE)(?![A-Za-z0-9])/;
export function pdfActiveContent(bytes: Buffer): string | null {
  const text = bytes.toString("latin1").replace(/#([0-9a-fA-F]{2})/g, (_, h: string) => String.fromCharCode(parseInt(h, 16)));
  return PDF_ACTIVE.exec(text)?.[1] ?? null;
}

/** Text that is really markup (HTML, SVG, XML, script) is refused: it can run in a browser if it is ever served back. */
const MARKUP = /^﻿?\s*</;
const MARKUP_ANYWHERE = /<\s*(script|svg|iframe|object|embed|html|!doctype)\b/i;
export function looksLikeMarkup(text: string): boolean {
  return MARKUP.test(text) || MARKUP_ANYWHERE.test(text.slice(0, 65_536));
}

export function fileExtension(name: string): string {
  const base = name.split(/[\\/]/).pop() ?? "";
  const i = base.lastIndexOf(".");
  return i <= 0 ? "" : base.slice(i).toLowerCase();
}

/**
 * Accepts or refuses an upload. With a file name (the web route always passes one), the name's ending must match the content type, so "report.pdf.exe"
 * and an executable named .pdf are both refused. Active PDFs and markup disguised as text are refused. Malware scanning is a separate step (scanner.ts).
 */
export function validateUpload(bytes: Buffer, filename?: string): DetectedType {
  if (bytes.length === 0) throw new UploadRejected("empty file");
  if (bytes.length > MAX_UPLOAD_BYTES) throw new UploadRejected("file too large");
  const t = detectType(bytes);
  if (!t) throw new UploadRejected("unsupported file type");
  if (filename !== undefined) {
    if (filename.length === 0 || filename.length > 255 || /[\u0000-\u001f]/.test(filename)) throw new UploadRejected("invalid file name");
    if (!ALLOWED_EXTENSIONS[t].includes(fileExtension(filename))) throw new UploadRejected(`file name does not match its content (a ${t} file must end with ${ALLOWED_EXTENSIONS[t].join(" or ")})`);
  }
  if (t === "text" && looksLikeMarkup(bytes.toString("utf8"))) throw new UploadRejected("markup is not accepted in text uploads");
  if (t === "pdf") {
    const active = pdfActiveContent(bytes);
    if (active) throw new UploadRejected(`PDF contains active content (${active})`);
  }
  return t;
}
