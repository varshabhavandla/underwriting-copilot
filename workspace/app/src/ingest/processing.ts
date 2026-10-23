import { withTenant, type Sql, type Tx, type TenantContext } from "../db/client";
import { appendAudit } from "../db/repo";
import type { DocType } from "../extraction/schemas";
import { log } from "../observability/log";
import type { Services } from "../server/services";
import { ingestDocument, type IngestResult } from "./ingest";
import { readDocument, ReadRefused, ReadUnavailable } from "./readDocument";
import { flagUnreadable } from "./unreadable";
import { detectType } from "../storage/validateUpload";

export type ProcessingStatus = "queued" | "processing" | "done" | "failed";
/** A document stuck in "processing" longer than this is treated as abandoned (the process died) and queued again. */
export const STALE_PROCESSING_MS = 10 * 60_000;

export async function queueProcessing(tx: Tx, tenantId: string, caseId: string, documentId: string): Promise<void> {
  await tx`insert into document_processing (tenant_id, document_id, case_id) values (${tenantId}, ${documentId}, ${caseId}) on conflict do nothing`;
}

/** Moves one document from queued to processing. Returns false when another worker already has it or it is not queued, so a document is processed once. */
export async function claim(sql: Sql, ctx: TenantContext, documentId: string): Promise<boolean> {
  const rows = await withTenant(sql, ctx, (tx) => tx`
    update document_processing set status = 'processing', started_at = now(), finished_at = null, error = null, attempts = attempts + 1
    where document_id = ${documentId} and status = 'queued' returning 1`);
  return rows.length === 1;
}

const finish = (sql: Sql, ctx: TenantContext, documentId: string, status: "done" | "failed", error?: string) =>
  withTenant(sql, ctx, (tx) => tx`update document_processing set status = ${status}, finished_at = now(), error = ${error ?? null} where document_id = ${documentId} and status = 'processing'`);

export interface ProcessSummary { skipped: boolean; result?: IngestResult; readBy?: string; manualReview?: boolean }

/**
 * Reads one queued document, extracts its facts and records the outcome. Safe to call twice: the second call finds nothing to claim. Every failure ends in a
 * state a person can see ("failed" with a generic reason) and never leaves the document in "processing" without a way back.
 */
export async function processDocument(s: Services, documentId: string, asOf = new Date()): Promise<ProcessSummary> {
  const ctx: TenantContext = { tenantId: s.tenantId, ...(s.userId ? { userId: s.userId } : {}) };
  if (!(await claim(s.sql, ctx, documentId))) return { skipped: true };
  try {
    const [doc] = await withTenant(s.sql, ctx, (tx) => tx<{ case_id: string; doc_type: string; version: number; storage_key: string }[]>`
      select case_id, doc_type, version, storage_key from documents where id = ${documentId}`);
    if (!doc) throw new Error("document not found");
    const bytes = await s.store.get(s.tenantId, doc.storage_key);
    const kind = detectType(bytes);
    if (!kind) throw new Error("unsupported file type");
    let read;
    try {
      read = await readDocument(bytes, kind);
    } catch (e) {
      if (!(e instanceof ReadUnavailable) && !(e instanceof ReadRefused)) throw e;
      const why = e instanceof ReadRefused ? `the file could not be read (${e.message}); needs manual review` : `the file could not be read automatically (${e.message}); needs manual review`;
      await withTenant(s.sql, ctx, async (tx) => {
        const dup = await tx`select 1 from exceptions where document_id = ${documentId} and kind = 'ocr_required'`;
        if (dup.length === 0) await flagUnreadable(tx, s.tenantId, doc.case_id, documentId, kind, why);
      });
      await finish(s.sql, ctx, documentId, "done");
      return { skipped: false, manualReview: true };
    }
    const result = await ingestDocument(s.sql, s.gateway, asOf, ctx, {
      caseId: doc.case_id, documentId, docVersion: doc.version, docType: doc.doc_type as DocType, pages: read.pages, source: read.source,
      ...(read.meanConfidence !== undefined ? { meanConfidence: read.meanConfidence } : {}),
    });
    await finish(s.sql, ctx, documentId, "done");
    return { skipped: false, result, readBy: read.source };
  } catch (e) {
    log("error", "document processing failed", { error: e });
    await withTenant(s.sql, ctx, (tx) => appendAudit(tx, s.tenantId, { actorKind: "system", actorId: "processing", action: "document.processing_failed", subject: { documentId }, result: "error" }));
    await finish(s.sql, ctx, documentId, "failed", "processing did not finish; it can be retried");
    return { skipped: false };
  }
}

/** Puts a failed document back in the queue. Returns false if it was not failed. */
export async function retryProcessing(sql: Sql, ctx: TenantContext, documentId: string): Promise<boolean> {
  const rows = await withTenant(sql, ctx, (tx) => tx`update document_processing set status = 'queued' where document_id = ${documentId} and status = 'failed' returning 1`);
  return rows.length === 1;
}

/** Documents abandoned in "processing" go back to the queue. Returns their ids so the caller can start them again. */
export async function requeueStale(sql: Sql, ctx: TenantContext, now = new Date()): Promise<string[]> {
  const cutoff = new Date(now.getTime() - STALE_PROCESSING_MS);
  const rows = await withTenant(sql, ctx, (tx) => tx<{ document_id: string }[]>`
    update document_processing set status = 'queued' where status = 'processing' and started_at < ${cutoff} returning document_id`);
  return rows.map((r) => r.document_id);
}

/** Documents of a case that look abandoned: queued for a while with nobody working on them, or stuck in processing. The caller starts them again. */
export async function stalledDocuments(sql: Sql, ctx: TenantContext, caseId: string, now = new Date()): Promise<string[]> {
  const stuck = new Date(now.getTime() - STALE_PROCESSING_MS);
  const idle = new Date(now.getTime() - 20_000);
  return withTenant(sql, ctx, async (tx) => {
    await tx`update document_processing set status = 'queued' where case_id = ${caseId} and status = 'processing' and started_at < ${stuck}`;
    const rows = await tx<{ document_id: string }[]>`select document_id from document_processing where case_id = ${caseId} and status = 'queued' and queued_at < ${idle} order by queued_at`;
    return rows.map((r) => r.document_id);
  });
}
