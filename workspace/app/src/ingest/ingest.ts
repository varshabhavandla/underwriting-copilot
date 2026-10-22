import { canonical } from "../extraction/normalize";
import { fieldKey, specFor, type DocType } from "../extraction/schemas";
import { validate, type FactView, type ValidationIssue } from "../extraction/validators";
import { withTenant, type Sql, type Tx, type TenantContext } from "../db/client";
import { appendAudit, proposeFact } from "../db/repo";
import { LlmGateway } from "../llm/gateway";
import { BudgetExceeded } from "../llm/types";
import { scanInjection } from "../pipeline";


export interface IngestInput {
  caseId: string;
  documentId: string;
  docVersion: number;
  docType: DocType;
  pages: string[];
}

export interface IngestResult {
  skipped: boolean;
  factsProposed: number;
  factsAccepted: number;
  exceptions: string[];
}

async function raise(tx: Tx, tenantId: string, caseId: string, documentId: string | null, kind: string, severity: string, detail: string, source: object): Promise<boolean> {
  const dup = await tx`select 1 from exceptions where case_id = ${caseId} and kind = ${kind} and detail = ${detail}`;
  if (dup.length) return false;
  await tx`insert into exceptions (tenant_id, case_id, document_id, kind, severity, detail, source) values (${tenantId}, ${caseId}, ${documentId}, ${kind}, ${severity}, ${detail}, ${tx.json(source as never)})`;
  await appendAudit(tx, tenantId, { actorKind: "system", actorId: "ingest", action: "exception.raised", subject: { caseId, documentId, kind, severity } });
  return true;
}

/**
 * Extract, verify, validate and persist one document. Facts are proposals; a fact is auto-accepted only when it is verified against
 * the source text AND no deterministic validator blocks it AND the document carries no injection flag. Model confidence is never consulted.
 * Idempotent: a document already processed is skipped.
 */
export async function ingestDocument(sql: Sql, gateway: LlmGateway, asOf: Date, ctx: TenantContext, input: IngestInput): Promise<IngestResult> {
  const { tenantId } = ctx;
  const injection = scanInjection({ caseRef: "", facts: [], documents: [{ id: input.documentId, type: input.docType, version: input.docVersion, pages: input.pages }] });

  const done = await withTenant(sql, ctx, (tx) => tx`select 1 from audit_events where action = 'document.processed' and subject->>'documentId' = ${input.documentId}`);
  if (done.length) return { skipped: true, factsProposed: 0, factsAccepted: 0, exceptions: [] };

  let outcome: Awaited<ReturnType<LlmGateway["extractFacts"]>> | undefined;
  let budgetError: string | undefined;
  try {
    outcome = await gateway.extractFacts(input.caseId, input.docType, input.pages);
  } catch (e) {
    if (e instanceof BudgetExceeded) budgetError = e.message;
    else throw e;
  }

  return withTenant(sql, ctx, async (tx) => {
    const exceptions: string[] = [];
    const note = async (kind: string, severity: string, detail: string, source: object = {}) => {
      if (await raise(tx, tenantId, input.caseId, input.documentId, kind, severity, detail, source)) exceptions.push(kind);
    };
    if (injection.length) await note("injection_suspected", "critical", "document contains instruction-like text; its facts need human review", { pages: injection.map((i) => i.page) });
    if (budgetError || !outcome) {
      await note("extraction_failed", "high", budgetError ?? "extraction did not run");
      await appendAudit(tx, tenantId, { actorKind: "system", actorId: "ingest", action: "document.processed", subject: { documentId: input.documentId, caseId: input.caseId }, result: "error" });
      return { skipped: false, factsProposed: 0, factsAccepted: 0, exceptions };
    }
    const c = outcome.call;
    await appendAudit(tx, tenantId, {
      actorKind: "agent", actorId: c.provider, action: "llm.call", subject: { documentId: input.documentId, caseId: input.caseId },
      llm: { provider: c.provider, model: c.model, promptVersion: c.promptVersion, inputHash: c.inputHash, outputHash: c.outputHash, tokensEstimate: c.tokensEstimate, modelConfidence: c.modelConfidence ?? null, redactedItems: c.redactedItems },
      result: c.result,
    });
    if (c.result === "error") await note("extraction_failed", "high", c.error ?? "provider error");
    for (const r of outcome.rejected) await note("unverifiable_extraction", "high", `${fieldKey(input.docType, r.field)}: ${r.reason}`, { field: r.field, reason: r.reason });

    // existing facts for this case, from other documents, as validator input
    const existing = await tx<{ doc_id: string; key: string; value: string }[]>`
      select doc_id, key, value from facts where case_id = ${input.caseId} and doc_id <> ${input.documentId}`;
    const views: FactView[] = [];
    for (const f of existing) {
      const [dt, field] = f.key.split(".") as [DocType, string];
      const spec = specFor(dt, field);
      const canon = spec ? canonical(spec.kind, f.value) : null;
      if (canon !== null) views.push({ docId: f.doc_id, docType: dt, field, canonicalValue: canon });
    }
    for (const v of outcome.verified) views.push({ docId: input.documentId, docType: input.docType, field: v.field, canonicalValue: v.canonicalValue });

    const issues: ValidationIssue[] = validate(views, asOf);
    const blocked = new Set<string>();
    for (const i of issues) {
      if (i.blocks.some((b) => b.docId === input.documentId) || i.blocks.length === 0) {
        await note(i.kind, i.severity, i.detail, { blocks: i.blocks });
        for (const b of i.blocks) if (b.docId === input.documentId) blocked.add(b.field);
      }
    }

    let proposed = 0, accepted = 0;
    for (const v of outcome.verified) {
      const checks = {
        citation_verified: true,
        value_valid: true,
        schema_allowed: true,
        validators: blocked.has(v.field) ? "failed" : "passed",
        document_not_flagged: injection.length === 0,
      };
      const applicable = [checks.citation_verified, checks.value_valid, checks.schema_allowed, checks.validators === "passed", checks.document_not_flagged];
      const score = applicable.filter(Boolean).length / applicable.length;
      const key = fieldKey(input.docType, v.field);
      const id = await proposeFact(tx, tenantId, {
        caseId: input.caseId, key, value: v.value,
        citation: { docId: input.documentId, docVersion: input.docVersion, page: v.page, passage: v.passage },
        evidence: checks, evidenceScore: score,
      });
      proposed++;
      if (score === 1) {
        await tx`update facts set status = 'accepted' where id = ${id}`;
        accepted++;
        await appendAudit(tx, tenantId, { actorKind: "system", actorId: "ingest", action: "fact.accepted", subject: { caseId: input.caseId, factId: id, key } });
      } else {
        await appendAudit(tx, tenantId, { actorKind: "system", actorId: "ingest", action: "fact.proposed", subject: { caseId: input.caseId, factId: id, key, score } });
      }
    }
    await appendAudit(tx, tenantId, { actorKind: "system", actorId: "ingest", action: "document.processed", subject: { documentId: input.documentId, caseId: input.caseId }, result: c.result });
    return { skipped: false, factsProposed: proposed, factsAccepted: accepted, exceptions };
  });
}
