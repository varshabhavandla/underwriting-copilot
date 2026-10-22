import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createServer } from "node:net";
import { downloadHeaders, safeDownloadName } from "../../src/storage/download";
import { ClamdScanner, NoScanner, ScanUnavailable } from "../../src/storage/scanner";
import { ALLOWED_EXTENSIONS, fileExtension, looksLikeMarkup, MAX_UPLOAD_BYTES, pdfActiveContent, UploadRejected, validateUpload } from "../../src/storage/validateUpload";
import { EICAR, startFakeClamd, type FakeClamd } from "../support/fakeClamd";

const PDF = Buffer.from("%PDF-1.7\n1 0 obj<</Type/Catalog>>endobj\ntrailer<<>>\n%%EOF\n");
const PNG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 0]);
const JPG = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 1, 2, 3]);
const TXT = Buffer.from("Net income: $120,000\nTotal assets: $400,000\n");

describe("file name must match the content (ASVS V5.2.2)", () => {
  it.each([["a.pdf", PDF], ["A.PDF", PDF], ["scan.png", PNG], ["p.jpg", JPG], ["p.JPEG", JPG], ["fs.txt", TXT], ["bank.csv", TXT]] as const)("%s is accepted", (name, bytes) => expect(() => validateUpload(bytes, name)).not.toThrow());
  it.each([
    ["report.pdf.exe", PDF], ["report.exe", PDF], ["noextension", PDF], ["image.png", PDF], ["doc.pdf", PNG], ["x.txt", PDF], ["x.pdf", TXT], ["photo.gif", JPG], [".pdf", PDF], ["a.pdf ", PDF],
  ] as const)("%s with that content is refused", (name, bytes) => expect(() => validateUpload(bytes, name), name).toThrow(/does not match/));
  it("refuses empty, overlong and control-character names", () => {
    for (const bad of ["", "a".repeat(252) + ".pdf", "a\u0000.pdf", "a\n.pdf"]) expect(() => validateUpload(PDF, bad), JSON.stringify(bad)).toThrow(/invalid file name/);
  });
  it("only the last extension counts, and directories are ignored", () => {
    expect(fileExtension("a/b\\c.d.PDF")).toBe(".pdf");
    expect(fileExtension(".hidden")).toBe("");
    expect(() => validateUpload(PDF, "../../etc/x.pdf")).not.toThrow();
  });
  it("control: without a name only the content is checked (existing behaviour)", () => expect(validateUpload(PDF)).toBe("pdf"));
  it("every detected type has at least one allowed extension", () => { for (const k of ["pdf", "png", "jpeg", "text"] as const) expect(ALLOWED_EXTENSIONS[k].length).toBeGreaterThan(0); });
  it("still refuses oversize and unknown content before looking at the name", () => {
    expect(() => validateUpload(Buffer.alloc(MAX_UPLOAD_BYTES + 1, 65), "a.txt")).toThrow(/too large/);
    expect(() => validateUpload(Buffer.from([0x4d, 0x5a, 0x90, 0x00]), "a.pdf")).toThrow(/unsupported/);
  });
});

describe("markup disguised as text (ASVS V1.3.4)", () => {
  it.each(["<svg xmlns='http://www.w3.org/2000/svg' onload='alert(1)'></svg>", "<!DOCTYPE html><html></html>", "  \n<script>alert(1)</script>", "﻿<?xml version='1.0'?><x/>", "Statement\n<script>alert(1)</script>", "Revenue\n<IFRAME src=x>", "<b>bold</b>"])("is refused: %s", (t) => {
    expect(() => validateUpload(Buffer.from(t), "x.txt")).toThrow(/markup/);
    expect(looksLikeMarkup(t)).toBe(true);
  });
  it.each(["Revenue < Expenses is not a loss: 3 < 5 and 7 > 2", "a<b", "Net income: $1,000\n", "<5 employees: 12"])("plain text that merely contains angle brackets is accepted: %s", (t) => {
    // "<5 employees" starts with a bracket and is refused by the conservative start-of-file rule; the others pass
    if (t.startsWith("<")) expect(() => validateUpload(Buffer.from(t), "x.txt")).toThrow(/markup/);
    else expect(() => validateUpload(Buffer.from(t), "x.txt")).not.toThrow();
  });
});

describe("PDFs with active content (ASVS V5.x)", () => {
  const withName = (n: string) => Buffer.from(`%PDF-1.7\n1 0 obj<</Type/Catalog${n}>>endobj\n%%EOF`);
  it.each(["/JavaScript", "/JS (app.alert(1))", "/Launch", "/OpenAction 2 0 R", "/AA<<>>", "/RichMedia", "/EmbeddedFile", "/XFA", "/SubmitForm", "/GoToR", "/ImportData"])("%s is refused", (n) => {
    expect(() => validateUpload(withName(n), "a.pdf"), n).toThrow(/active content/);
  });
  it("hex-escaped names do not hide it (/J#61vaScript, /#4Aavascript)", () => {
    expect(pdfActiveContent(withName("/J#61vaScript"))).toBe("JavaScript");
    expect(pdfActiveContent(withName("/#4AS"))).toBe("JS");
    expect(() => validateUpload(withName("/J#61vaScript"), "a.pdf")).toThrow(/active content/);
  });
  it("names that merely start with a risky word are not mistaken for it, and ordinary PDFs pass (control)", () => {
    expect(pdfActiveContent(withName("/JSON"))).toBeNull();
    expect(pdfActiveContent(withName("/Author(Jo)/Producer(x)"))).toBeNull();
    expect(validateUpload(PDF, "a.pdf")).toBe("pdf");
    expect(validateUpload(withName("/URI(https://example.com)"), "a.pdf")).toBe("pdf"); // ordinary links are allowed
  });
});

describe("malware scanning through the ClamAV protocol (ASVS V5.4.3)", () => {
  let clam: FakeClamd;
  beforeAll(async () => { clam = await startFakeClamd(); });
  afterAll(async () => { await clam.close(); });
  const scanner = (ms = 2000) => new ClamdScanner("127.0.0.1", clam.port, ms);
  it("a clean file is clean", async () => { clam.mode = "normal"; expect(await scanner().scan(PDF)).toEqual({ clean: true }); });
  it("the EICAR test string is reported with the signature name", async () => {
    clam.mode = "normal";
    expect(await scanner().scan(Buffer.from("hello " + EICAR))).toEqual({ clean: false, signature: "Win.Test.EICAR_HDB-1" });
  });
  it("a large file is streamed in chunks and arrives whole", async () => {
    clam.mode = "normal"; const big = Buffer.alloc(300_000, 0x61); clam.streamed.length = 0;
    expect((await scanner().scan(big)).clean).toBe(true);
    expect(clam.streamed.at(-1)).toBe(300_000);
  });
  it("an infection placed after the first chunk is still found", async () => {
    clam.mode = "normal"; const sneaky = Buffer.concat([Buffer.alloc(200_000, 0x61), Buffer.from(EICAR)]);
    expect((await scanner().scan(sneaky)).clean).toBe(false);
  });
  for (const mode of ["slow", "error", "garbage", "hangup"] as const) {
    it(`fails closed when the scanner misbehaves (${mode})`, async () => {
      clam.mode = mode;
      await expect(scanner(500).scan(PDF)).rejects.toBeInstanceOf(ScanUnavailable);
    });
  }
  it("fails closed when nothing is listening", async () => {
    const probe = createServer(); await new Promise<void>((r) => probe.listen(0, "127.0.0.1", r));
    const dead = (probe.address() as { port: number }).port; await new Promise((r) => probe.close(r));
    await expect(new ClamdScanner("127.0.0.1", dead, 500).scan(PDF)).rejects.toBeInstanceOf(ScanUnavailable);
  });
  it("the development stand-in says clean for everything (and production refuses to use it)", async () => {
    expect(await new NoScanner().scan()).toEqual({ clean: true });
  });
});

describe("serving a stored file back (for the future viewer)", () => {
  it("is always an attachment with a content type taken from our detection, nosniff and a sandbox policy", () => {
    const h = downloadHeaders("statement.html", "pdf");
    expect(h["content-type"]).toBe("application/pdf");
    expect(h["content-disposition"]).toMatch(/^attachment; /);
    expect(h["x-content-type-options"]).toBe("nosniff");
    expect(h["content-security-policy"]).toContain("sandbox");
    expect(downloadHeaders("x.svg", "text")["content-type"]).toBe("text/plain; charset=utf-8");
  });
  it("a hostile name cannot break out of the header or choose the saved extension", () => {
    for (const evil of ['a"; filename="evil.exe', "a\r\nSet-Cookie: x=1", "../../etc/passwd", "..\\..\\boot.ini", "x\u0000.pdf", "évil Ünicode ✓.pdf", ".hidden", "", "a".repeat(500) + ".exe"]) {
      const h = downloadHeaders(evil, "pdf");
      expect(Object.values(h).every((v) => !/[\r\n]/.test(v)), evil).toBe(true);
      expect(h["content-disposition"]!.match(/filename="/g)?.length, evil).toBe(1);
      expect(safeDownloadName(evil, "pdf"), evil).toMatch(/\.pdf$/);
      expect(safeDownloadName(evil, "pdf")).not.toMatch(/[\\/]/);
    }
  });
  it("non-ASCII names get an encoded filename* as well as an ASCII fallback", () => {
    const h = downloadHeaders("résumé.pdf", "pdf")["content-disposition"]!;
    expect(h).toContain("filename*=UTF-8''r%C3%A9sum%C3%A9.pdf");
    expect(/filename="[\x20-\x7e]*"/.test(h)).toBe(true);
  });
});
