import { createHash } from "node:crypto";
import { performance } from "node:perf_hooks";
import { submitApplication } from "../application/submit";
import type { KeyProvider } from "../crypto/fieldCrypto";
import { withTenant, type Sql, type TenantContext } from "../db/client";
import { addDocument } from "../db/repo";
import { canonical } from "../extraction/normalize";
import { specFor, type DocType } from "../extraction/schemas";
import { buildFile } from "../file/buildFile";
import { ingestDocument } from "../ingest/ingest";
import { flagUnreadable } from "../ingest/unreadable";
import { DEFAULT_OPTIONS, LlmGateway } from "../llm/gateway";
import { MockProvider, type MockBehavior } from "../llm/mockProvider";
import { BASELINE_EXCEPTIONS, FILE_CLASSES, type FileClass } from "../synthetic/classes";
import { makePacket } from "../synthetic/generate";
import type { Counts } from "./timeModel";

export interface ClassResult {
  cls: FileClass;
  packets: number;
  truthFields: number;
  acceptedCorrect: number;
  falseAccepts: number;
  proposedOnly: number;
  notExtracted: number;
  expectedDefects: number;
  detectedDefects: number;
  falsePositivePackets: number;
  memoVerified: number;
  /** packets where an extraction-integrity exception was raised (unverifiable value, failed extraction, injection, unverified memo) */
  integrityAlertPackets: number;
  decisionsMade: number;
  counts: Counts;           // mean per packet
  ingestMs: number[];
  buildMs: number[];
}

const ASOF = new Date("2026-10-21T00:00:00Z");

/** Runs every file class through the real pipeline (application, ingestion, rules, memo) and scores it against ground truth. */
export async function runPipelineEval(app: Sql, ctx: TenantContext, keys: KeyProvider, perClass: number, behavior: MockBehavior = "faithful", seedOffset = 0): Promise<ClassResult[]> {
  const results: ClassResult[] = [];
  for (const [ci, cls] of FILE_CLASSES.entries()) {
    const r: ClassResult = { cls, packets: perClass, truthFields: 0, acceptedCorrect: 0, falseAccepts: 0, proposedOnly: 0, notExtracted: 0, expectedDefects: 0, detectedDefects: 0, falsePositivePackets: 0, memoVerified: 0, integrityAlertPackets: 0, decisionsMade: 0, counts: { documents: 0, fields: 0, exceptions: 0, memoLines: 0, rules: 0 }, ingestMs: [], buildMs: [] };
    const sums = { documents: 0, fields: 0, exceptions: 0, memoLines: 0, rules: 0 };
    for (let i = 0; i < perClass; i++) {
      const seed = seedOffset + (ci + 1) * 1000 + i + 1;
      const pk = makePacket(seed, cls.variant, ASOF);
      const sub = await withTenant(app, ctx, (tx) => submitApplication(tx, keys, ctx.tenantId, {
        legalName: `${pk.legalName} ${seed}`, entityType: "s_corp", ein: "12-3456789", naics: "722511", yearsInBusiness: 6, requestedTermMonths: 120, loanAmount: "$250,000",
        purposes: ["equipment"], owners: [{ name: "A Owner", percent: 100 }], certifyAccurate: true, ...cls.app,
      }));
      const docIds = new Map<string, string>();
      await withTenant(app, ctx, async (tx) => {
        for (const d of pk.docs) docIds.set(d.id, await addDocument(tx, ctx.tenantId, { caseId: sub.caseId, docType: d.type, contentSha256: createHash("sha256").update(d.pages.join("\n") + seed).digest("hex"), storageKey: `${ctx.tenantId}/${sub.caseId}/${d.id}` }));
      });
      const gw = new LlmGateway(new MockProvider(behavior), DEFAULT_OPTIONS);
      const t0 = performance.now();
      if (cls.unreadable) {
        await withTenant(app, ctx, async (tx) => { for (const d of pk.docs) await flagUnreadable(tx, ctx.tenantId, sub.caseId, docIds.get(d.id)!, "pdf"); });
      } else {
        for (const d of pk.docs) await ingestDocument(app, gw, ASOF, ctx, { caseId: sub.caseId, documentId: docIds.get(d.id)!, docVersion: 1, docType: d.type, pages: d.pages });
      }
      const t1 = performance.now();
      const built = await buildFile(app, gw, ctx, sub.caseId, ASOF);
      const t2 = performance.now();
      r.ingestMs.push(t1 - t0); r.buildMs.push(t2 - t1);

      const facts = await withTenant(app, ctx, (tx) => tx<{ doc_id: string; key: string; value: string; status: string }[]>`select doc_id, key, value, status from facts where case_id = ${sub.caseId}`);
      const kinds = (await withTenant(app, ctx, (tx) => tx<{ kind: string }[]>`select kind from exceptions where case_id = ${sub.caseId}`)).map((e) => e.kind);
      const memo = (await withTenant(app, ctx, (tx) => tx<{ sections: { lines: unknown[] }[] }[]>`select sections from memos where case_id = ${sub.caseId} order by created_at desc limit 1`))[0];

      for (const t of pk.truth) {
        const dbDoc = docIds.get(t.docId)!;
        const docType = pk.docs.find((d) => d.id === t.docId)!.type as DocType;
        const spec = specFor(docType, t.field)!;
        r.truthFields++;
        const f = facts.find((x) => x.doc_id === dbDoc && x.key === `${docType}.${t.field}`);
        if (!f) { r.notExtracted++; continue; }
        const ok = canonical(spec.kind, f.value) === t.value;
        if (f.status === "accepted") { if (ok) r.acceptedCorrect++; else r.falseAccepts++; } else r.proposedOnly++;
      }
      r.expectedDefects += cls.expects.length;
      r.detectedDefects += cls.expects.filter((k) => kinds.includes(k)).length;
      const allowed = new Set([...BASELINE_EXCEPTIONS, ...cls.expects, ...(cls.knockOns ?? [])]);
      if (kinds.some((k) => !allowed.has(k))) r.falsePositivePackets++;
      if (memo) r.memoVerified++;
      if (kinds.some((k) => ["unverifiable_extraction", "extraction_failed", "injection_suspected", "memo_unverified"].includes(k))) r.integrityAlertPackets++;
      sums.documents += pk.docs.length;
      sums.fields += pk.truth.length;
      sums.exceptions += kinds.length;
      sums.memoLines += memo ? memo.sections.reduce((n, s) => n + s.lines.length, 0) : 0;
      sums.rules += built.results.filter((x) => x.outcome !== "not_applicable").length;
    }
    r.counts = { documents: sums.documents / perClass, fields: sums.fields / perClass, exceptions: sums.exceptions / perClass, memoLines: sums.memoLines / perClass, rules: sums.rules / perClass };
    results.push(r);
  }
  return results;
}
