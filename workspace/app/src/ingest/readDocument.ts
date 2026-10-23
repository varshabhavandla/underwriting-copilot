import { execFile } from "node:child_process";
import { mkdtemp, readdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { DetectedType } from "../storage/validateUpload";

/**
 * Turns an uploaded file into page text (D-037). A text file is read as is. A PDF with a text layer is read with pdftotext, which is exact.
 * A scan or an image is read with Tesseract OCR, which can misread a digit, so facts that come from OCR are never auto-accepted (see ingest.ts).
 * Everything runs locally: no document leaves the machine here. The programs are executed without a shell, with fixed arguments, a time limit,
 * an output limit and a private temporary directory that is always removed. Nothing in the document influences a command line.
 */
export type ReadSource = "text" | "pdf_text" | "ocr";
export interface ReadResult {
  source: ReadSource;
  pages: string[];
  /** Mean word confidence from the OCR engine, 0 to 100. Only for source "ocr". */
  meanConfidence?: number;
  engine?: string;
}

/** The programs needed are not installed or failed. The caller keeps the file and sends it to manual review. */
export class ReadUnavailable extends Error {}
/** The file is outside the limits (too many pages, too large an image). */
export class ReadRefused extends Error {}

export const READ_LIMITS = { maxPages: 20, maxImageSide: 10_000, maxImagePixels: 40_000_000, commandTimeoutMs: 60_000, maxOutputBytes: 8 * 1024 * 1024, pdfDpi: 200, minCharsPerTextPage: 40 };

const run = (file: string, args: string[], cwd: string): Promise<string> =>
  new Promise((resolve, reject) => {
    execFile(file, args, { cwd, timeout: READ_LIMITS.commandTimeoutMs, killSignal: "SIGKILL", maxBuffer: READ_LIMITS.maxOutputBytes, encoding: "utf8",
      env: { PATH: process.env["PATH"] ?? "/usr/bin:/bin", HOME: cwd, TMPDIR: cwd, LANG: "C.UTF-8", OMP_THREAD_LIMIT: "1" } as unknown as NodeJS.ProcessEnv },
      (err, stdout) => {
        if (err) reject(Object.assign(new Error(`${file} failed`), { code: (err as NodeJS.ErrnoException).code }));
        else resolve(stdout);
      });
  });

let tools: Promise<{ pdf: boolean; ocr: boolean }> | undefined;
/** Which of the programs are installed. Checked once per process. */
export function availableTools(): Promise<{ pdf: boolean; ocr: boolean }> {
  tools ??= (async () => {
    const ok = (file: string, arg: string) => run(file, [arg], tmpdir()).then(() => true, (e: { code?: string }) => e.code !== "ENOENT");
    const [pdftotext, pdftoppm, tesseract] = await Promise.all([ok("pdftotext", "-v"), ok("pdftoppm", "-v"), ok("tesseract", "--version")]);
    return { pdf: pdftotext, ocr: pdftoppm && tesseract };
  })();
  return tools;
}
/** For tests: forget the cached answer. */
export const resetToolCheck = (): void => { tools = undefined; };

/** Width and height of a PNG or JPEG from its header, so an image bomb is refused before any decoder sees it. */
export function imageSize(bytes: Buffer, kind: "png" | "jpeg"): { w: number; h: number } | null {
  if (kind === "png") return bytes.length >= 24 ? { w: bytes.readUInt32BE(16), h: bytes.readUInt32BE(20) } : null;
  let i = 2;
  while (i + 9 < bytes.length) {
    if (bytes[i] !== 0xff) { i++; continue; }
    const m = bytes[i + 1]!;
    if (m >= 0xc0 && m <= 0xcf && m !== 0xc4 && m !== 0xc8 && m !== 0xcc) return { h: bytes.readUInt16BE(i + 5), w: bytes.readUInt16BE(i + 7) };
    if (m === 0xd8 || m === 0x01 || (m >= 0xd0 && m <= 0xd7)) { i += 2; continue; }
    i += 2 + bytes.readUInt16BE(i + 2);
  }
  return null;
}

/** Tesseract TSV to lines of text and the mean word confidence. Rebuilding lines keeps "Label: value" on one line, which citations rely on. */
export function parseTsv(tsv: string): { text: string; meanConfidence: number | null } {
  const lines = new Map<string, string[]>();
  const order: string[] = [];
  let sum = 0, n = 0;
  for (const row of tsv.split("\n").slice(1)) {
    const c = row.split("\t");
    if (c.length < 12 || c[0] !== "5") continue;
    const word = c.slice(11).join("\t").trim();
    if (!word) continue;
    const key = `${c[2]}.${c[3]}.${c[4]}`;
    if (!lines.has(key)) { lines.set(key, []); order.push(key); }
    lines.get(key)!.push(word);
    const conf = Number(c[10]);
    if (Number.isFinite(conf) && conf >= 0) { sum += conf; n++; }
  }
  return { text: order.map((k) => lines.get(k)!.join(" ")).join("\n"), meanConfidence: n ? Math.round((sum / n) * 10) / 10 : null };
}

async function ocrImage(dir: string, file: string): Promise<{ text: string; conf: number | null }> {
  const tsv = await run("tesseract", [file, "stdout", "-l", "eng", "--psm", "6", "tsv"], dir);
  const p = parseTsv(tsv);
  return { text: p.text, conf: p.meanConfidence };
}

export async function readDocument(bytes: Buffer, kind: DetectedType): Promise<ReadResult> {
  if (kind === "text") return { source: "text", pages: bytes.toString("utf8").split("\f") };
  const t = await availableTools();
  if (kind === "pdf" && !t.pdf) throw new ReadUnavailable("pdftotext is not installed");
  if (kind !== "pdf" && !t.ocr) throw new ReadUnavailable("OCR is not installed");
  if (kind !== "pdf") {
    const size = imageSize(bytes, kind);
    if (!size || size.w < 1 || size.h < 1) throw new ReadRefused("image size could not be read");
    if (size.w > READ_LIMITS.maxImageSide || size.h > READ_LIMITS.maxImageSide || size.w * size.h > READ_LIMITS.maxImagePixels) throw new ReadRefused("image is too large to read");
  }
  const dir = await mkdtemp(join(tmpdir(), "uw-read-"));
  try {
    const input = join(dir, kind === "pdf" ? "in.pdf" : kind === "png" ? "in.png" : "in.jpg");
    await writeFile(input, bytes, { mode: 0o600 });
    if (kind !== "pdf") {
      const r = await ocrImage(dir, input).catch(() => { throw new ReadUnavailable("OCR failed"); });
      return { source: "ocr", pages: [r.text], ...(r.conf !== null ? { meanConfidence: r.conf } : {}), engine: "tesseract" };
    }
    const info = await run("pdfinfo", [input], dir).catch(() => "");
    const count = Number(/^Pages:\s+(\d+)/m.exec(info)?.[1] ?? "1");
    if (count > READ_LIMITS.maxPages) throw new ReadRefused(`PDF has more than ${READ_LIMITS.maxPages} pages`);
    const last = String(Math.max(1, Math.min(count, READ_LIMITS.maxPages)));
    const raw = await run("pdftotext", ["-layout", "-enc", "UTF-8", "-f", "1", "-l", last, input, "-"], dir).catch(() => { throw new ReadUnavailable("pdftotext failed"); });
    const pages = raw.split("\f");
    if (pages.length > 1 && pages[pages.length - 1]!.trim() === "") pages.pop();
    const chars = pages.reduce((a, p) => a + p.replace(/\s/g, "").length, 0);
    if (chars >= READ_LIMITS.minCharsPerTextPage * pages.length) return { source: "pdf_text", pages, engine: "pdftotext" };

    // no usable text layer: render each page and read it as an image
    if (!t.ocr) throw new ReadUnavailable("the PDF is a scan and OCR is not installed");
    await run("pdftoppm", ["-r", String(READ_LIMITS.pdfDpi), "-png", "-f", "1", "-l", last, input, join(dir, "pg")], dir).catch(() => { throw new ReadUnavailable("PDF could not be rendered"); });
    const files = (await readdir(dir)).filter((f) => /^pg-\d+\.png$/.test(f)).sort();
    if (files.length === 0) throw new ReadUnavailable("PDF could not be rendered");
    const out: string[] = [];
    let sum = 0, n = 0;
    for (const f of files) {
      const buf = await readFile(join(dir, f));
      const size = imageSize(buf, "png");
      if (!size || size.w * size.h > READ_LIMITS.maxImagePixels) throw new ReadRefused("a PDF page is too large to read");
      const r = await ocrImage(dir, join(dir, f)).catch(() => { throw new ReadUnavailable("OCR failed"); });
      out.push(r.text);
      if (r.conf !== null) { sum += r.conf; n++; }
    }
    return { source: "ocr", pages: out, ...(n ? { meanConfidence: Math.round((sum / n) * 10) / 10 } : {}), engine: "tesseract" };
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}
