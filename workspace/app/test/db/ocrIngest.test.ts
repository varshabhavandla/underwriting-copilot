import { readFileSync } from "node:fs";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { connect, withTenant, type Sql } from "../../src/db/client";
import { addDocument, createCase } from "../../src/db/repo";
import { ingestDocument } from "../../src/ingest/ingest";
import { readDocument } from "../../src/ingest/readDocument";
import { LlmGateway, DEFAULT_OPTIONS } from "../../src/llm/gateway";
import { MockProvider } from "../../src/llm/mockProvider";
import { dbEnabled, urls } from "./urls";

const ASOF = new Date("2026-10-21T00:00:00Z");
const scans = join(__dirname, "..", "..", "fixtures", "synthetic", "scans");

describe.skipIf(!dbEnabled)("OCR and PDF reading through ingestion (D-037)", () => {
  let owner: Sql, app: Sql;
  let tenant = "", user = "";
  beforeAll(async () => {
    owner = connect(urls.owner());
    app = connect(urls.app());
    const [t] = await owner<{ id: string }[]>`select gen_random_uuid() as id`;
    tenant = t!.id;
    user = await withTenant(owner, { tenantId: tenant }, async (tx) => {
      await tx`insert into tenants (id, name) values (${tenant}, 'ocr-a')`;
      const [u] = await tx<{ id: string }[]>`insert into users (tenant_id, email, role) values (${tenant}, 'ocr-a@example.test', 'underwriter') returning id`;
      return u!.id;
    });
  });
  afterAll(async () => { await Promise.all([owner.end(), app.end()]); });

  const ctx = () => ({ tenantId: tenant, userId: user });
  async function ingestFile(name: string, kind: "png" | "pdf" | "jpeg", sha: string) {
    const read = await readDocument(readFileSync(join(scans, name)), kind);
    const ids = await withTenant(app, ctx(), async (tx) => {
      const c = await createCase(tx, tenant, { caseRef: "ocr-" + sha, docHashes: [sha] });
      const d = await addDocument(tx, tenant, { caseId: c.id, docType: "financial_statement", contentSha256: sha, storageKey: `${tenant}/${c.id}/${sha}`, version: 1 });
      return { caseId: c.id, documentId: d };
    });
    const r = await ingestDocument(app, new LlmGateway(new MockProvider("faithful"), DEFAULT_OPTIONS), ASOF, ctx(),
      { caseId: ids.caseId, documentId: ids.documentId, docVersion: 1, docType: "financial_statement", pages: read.pages, source: read.source, ...(read.meanConfidence !== undefined ? { meanConfidence: read.meanConfidence } : {}) });
    const facts = await withTenant(app, ctx(), (tx) => tx<{ key: string; status: string; value: string; passage: string }[]>`select key, status, value, passage from facts where case_id = ${ids.caseId} order by key`);
    const excs = await withTenant(app, ctx(), (tx) => tx<{ kind: string; severity: string }[]>`select kind, severity from exceptions where case_id = ${ids.caseId} order by kind`);
    const audit = await withTenant(app, ctx(), (tx) => tx<{ read_by: string }[]>`select subject->>'readBy' as read_by from audit_events where action = 'document.processed' and subject->>'documentId' = ${ids.documentId}`);
    return { r, facts, excs, audit, read };
  }

  it("a scanned image is read, cited, and every fact is held for a person (never auto-accepted)", async () => {
    const o = await ingestFile("statement.png", "png", "a".repeat(63) + "1");
    expect(o.read.source).toBe("ocr");
    expect(o.facts).toHaveLength(6);
    expect(o.facts.every((f) => f.status === "proposed" && f.passage.length > 0)).toBe(true);
    expect(o.facts.find((f) => f.key === "financial_statement.revenue")?.value).toBe("1,803,622.07");
    expect(o.excs).toEqual([{ kind: "ocr_source", severity: "medium" }]);
    expect(o.r.factsAccepted).toBe(0);
    expect(o.audit).toEqual([{ read_by: "ocr" }]);
  });

  it("a scanned PDF behaves the same way", async () => {
    const o = await ingestFile("scan.pdf", "pdf", "a".repeat(63) + "2");
    expect(o.read.source).toBe("ocr");
    expect(o.facts.every((f) => f.status === "proposed")).toBe(true);
    expect(o.excs.map((e) => e.kind)).toContain("ocr_source");
  });

  it("a PDF with a real text layer is read exactly and its facts are auto-accepted as before (control)", async () => {
    const o = await ingestFile("text-layer.pdf", "pdf", "a".repeat(63) + "3");
    expect(o.read.source).toBe("pdf_text");
    expect(o.facts).toHaveLength(6);
    expect(o.facts.every((f) => f.status === "accepted")).toBe(true);
    expect(o.excs).toEqual([]);
    expect(o.audit).toEqual([{ read_by: "pdf_text" }]);
  });

  it("a hard-to-read scan raises a high-severity low-confidence exception, and a misread figure is never accepted", async () => {
    const o = await ingestFile("statement-blurry.png", "png", "a".repeat(63) + "4");
    expect(o.read.meanConfidence!).toBeLessThan(75);
    expect(o.excs.map((e) => `${e.kind}:${e.severity}`)).toEqual(["ocr_low_confidence:high", "ocr_source:medium", "unverifiable_extraction:high"]);
    expect(o.r.factsAccepted).toBe(0);
    expect(o.facts.every((f) => f.status === "proposed")).toBe(true);
    // the degraded scan makes OCR read 8 as 0 in the revenue: a proposed fact may carry that wrong value, which is exactly why it is held
    expect(o.facts.some((f) => f.key === "financial_statement.revenue" && f.status === "accepted")).toBe(false);
  });
});
