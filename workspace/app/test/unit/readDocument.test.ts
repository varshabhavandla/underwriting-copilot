import { readdirSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { beforeAll, describe, expect, it } from "vitest";
import { availableTools, imageSize, parseTsv, readDocument, ReadRefused, ReadUnavailable, resetToolCheck } from "../../src/ingest/readDocument";

const dir = join(__dirname, "..", "..", "fixtures", "synthetic", "scans");
const file = (n: string) => readFileSync(join(dir, n));
const FIELDS = ["As of: 2026-09-21", "Revenue: $1,803,622.07", "Net income: $319,421.48", "Total assets: $1,200,771.07", "Total liabilities: $538,677.31", "Total equity: $662,093.76"];
const leftovers = () => readdirSync(tmpdir()).filter((f) => f.startsWith("uw-read-")).length;

beforeAll(async () => {
  const t = await availableTools();
  if ((!t.pdf || !t.ocr) && process.env["UW_ALLOW_NO_OCR"] !== "1") {
    throw new Error("pdftotext, pdftoppm and tesseract are required for these tests (apt-get install poppler-utils tesseract-ocr), or set UW_ALLOW_NO_OCR=1 to skip knowingly");
  }
});

describe("reading documents", () => {
  it("reads text as is", async () => {
    const r = await readDocument(Buffer.from("Revenue: $1.00\fRevenue: $2.00"), "text");
    expect(r).toEqual({ source: "text", pages: ["Revenue: $1.00", "Revenue: $2.00"] });
  });

  it("reads a PDF with a text layer exactly, without OCR", async () => {
    const r = await readDocument(file("text-layer.pdf"), "pdf");
    expect(r.source).toBe("pdf_text");
    for (const line of FIELDS) expect(r.pages.join("\n")).toContain(line);
  });

  it("reads a scanned PDF (no text layer) with OCR and reports confidence", async () => {
    const r = await readDocument(file("scan.pdf"), "pdf");
    expect(r.source).toBe("ocr");
    expect(r.engine).toBe("tesseract");
    expect(r.meanConfidence).toBeGreaterThan(80);
    for (const line of FIELDS) expect(r.pages.join("\n")).toContain(line);
  });

  it.each([["statement.png", "png"], ["statement.jpg", "jpeg"]] as const)("reads %s with OCR, keeping each label and value on one line", async (name, kind) => {
    const r = await readDocument(file(name), kind);
    expect(r.source).toBe("ocr");
    expect(r.pages).toHaveLength(1);
    for (const line of FIELDS) expect(r.pages[0]).toContain(line);
  });

  it("reports lower confidence for a blurry scan, so it can be flagged", async () => {
    const clear = await readDocument(file("statement.png"), "png");
    const blurry = await readDocument(file("statement-blurry.png"), "png");
    expect(clear.meanConfidence!).toBeGreaterThan(90);
    expect(blurry.meanConfidence!).toBeLessThan(clear.meanConfidence! - 40);
  });

  it("removes its temporary files, also when the file cannot be read", async () => {
    const before = leftovers();
    await readDocument(file("scan.pdf"), "pdf");
    await readDocument(Buffer.concat([Buffer.from("%PDF-1.4\n"), Buffer.from("not really a pdf")]), "pdf").catch(() => undefined);
    expect(leftovers()).toBe(before);
  });

  it("refuses an image too large to decode before any program sees it", async () => {
    const big = Buffer.from(file("statement.png"));
    big.writeUInt32BE(30_000, 16); big.writeUInt32BE(30_000, 20);
    await expect(readDocument(big, "png")).rejects.toBeInstanceOf(ReadRefused);
  });

  it("refuses a PDF with too many pages", async () => {
    const many = Buffer.from(readFileSync(join(__dirname, "..", "..", "fixtures", "synthetic", "scans", "many-pages.pdf")));
    await expect(readDocument(many, "pdf")).rejects.toBeInstanceOf(ReadRefused);
  });

  it("sends a file to manual review when the programs are missing", async () => {
    const saved = process.env["PATH"];
    process.env["PATH"] = "/nonexistent";
    resetToolCheck();
    try {
      await expect(readDocument(file("statement.png"), "png")).rejects.toBeInstanceOf(ReadUnavailable);
      await expect(readDocument(file("text-layer.pdf"), "pdf")).rejects.toBeInstanceOf(ReadUnavailable);
      expect((await readDocument(Buffer.from("Revenue: $1.00"), "text")).source).toBe("text"); // text needs no program
    } finally {
      process.env["PATH"] = saved;
      resetToolCheck();
    }
  });
});

describe("helpers", () => {
  it("reads image sizes from headers", () => {
    expect(imageSize(file("statement.png"), "png")).toEqual({ w: 1300, h: 420 });
    expect(imageSize(file("statement.jpg"), "jpeg")).toEqual({ w: 1300, h: 420 });
    expect(imageSize(Buffer.from([0xff, 0xd8, 0xff]), "jpeg")).toBeNull();
  });
  it("rebuilds lines and the mean confidence from Tesseract TSV", () => {
    const tsv = ["level\tpage_num\tblock_num\tpar_num\tline_num\tword_num\tleft\ttop\twidth\theight\tconf\ttext",
      "5\t1\t1\t1\t1\t1\t0\t0\t10\t10\t96.5\tRevenue:", "5\t1\t1\t1\t1\t2\t0\t0\t10\t10\t90.5\t$1.00", "5\t1\t1\t1\t2\t1\t0\t0\t10\t10\t-1\t", "5\t1\t1\t1\t2\t2\t0\t0\t10\t10\t80\tNet"].join("\n");
    expect(parseTsv(tsv)).toEqual({ text: "Revenue: $1.00\nNet", meanConfidence: 89 });
  });
});
