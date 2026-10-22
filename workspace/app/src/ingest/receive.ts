/**
 * Receiving an uploaded document: validate by content and name, scan for malware (fail closed), store encrypted, record, and ingest. Used by the API route
 * and by the console's upload form so both apply exactly the same rules. Returns an HTTP-style result; nothing here throws for a refused file.
 */
import { withTenant } from "../db/client";
import { addDocument, appendAudit } from "../db/repo";
import { DOC_TYPES, type DocType } from "../extraction/schemas";
import { ingestDocument } from "./ingest";
import { flagUnreadable } from "./unreadable";
import { log } from "../observability/log";
import { inc } from "../observability/metrics";
import type { Services } from "../server/services";
import { objectKey, sha256Hex } from "../storage/objectStore";
import { ScanUnavailable } from "../storage/scanner";
import { UploadRejected, validateUpload } from "../storage/validateUpload";

export interface ReceiveResult { status: number; body: Record<string, unknown>; headers?: Record<string, string> }
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function receiveDocument(s: Services, caseId: string, upload: { name: string; bytes: Buffer }, docType: string): Promise<ReceiveResult> {
  if (!UUID.test(caseId)) return { status: 404, body: { error: "not found" } };
  if (!(DOC_TYPES as string[]).includes(docType)) return { status: 400, body: { error: "file and a valid docType are required" } };
  const { bytes } = upload;
  let kind;
  try {
    kind = validateUpload(bytes, upload.name);
  } catch (e) {
    if (e instanceof UploadRejected) return { status: 415, body: { error: e.message } };
    throw e;
  }
  const sha = sha256Hex(bytes);
  const tctx = { tenantId: s.tenantId, ...(s.userId ? { userId: s.userId } : {}) };
  const exists = await withTenant(s.sql, tctx, (tx) => tx`select 1 from cases where id = ${caseId}`);
  if (exists.length === 0) return { status: 404, body: { error: "not found" } }; // same answer for missing and foreign cases

  // Malware scan before anything is stored. Fails closed: if the scanner cannot answer, the file is not accepted and the caller may retry.
  try {
    const scan = await s.scanner.scan(bytes);
    if (!scan.clean) {
      await withTenant(s.sql, tctx, (tx) => appendAudit(tx, s.tenantId, { actorKind: "user", actorId: s.userId ?? "unknown", action: "document.rejected", subject: { caseId, reason: "malware", signature: scan.signature ?? "unknown" }, result: "rejected" }));
      inc("uploads_rejected_total", { reason: "malware" });
      return { status: 422, body: { error: "file rejected by the malware scan" } };
    }
  } catch (e) {
    if (!(e instanceof ScanUnavailable)) throw e;
    inc("uploads_rejected_total", { reason: "scanner_unavailable" });
    log("error", "malware scanner unavailable", { error: e });
    return { status: 503, body: { error: "the upload could not be scanned; try again shortly" }, headers: { "retry-after": "30" } };
  }

  const key = objectKey(s.tenantId, caseId, sha);
  const existing = await withTenant(s.sql, tctx, (tx) => tx<{ id: string }[]>`select id from documents where case_id = ${caseId} and content_sha256 = ${sha}`);
  let documentId = existing[0]?.id;
  if (!documentId) {
    await s.store.put(s.tenantId, key, bytes).catch((e: Error) => { if (!/EEXIST/.test(e.message)) throw e; });
    documentId = await withTenant(s.sql, tctx, async (tx) => {
      const id = await addDocument(tx, s.tenantId, { caseId, docType, contentSha256: sha, storageKey: key });
      await appendAudit(tx, s.tenantId, { actorKind: "user", actorId: s.userId ?? "borrower", action: "document.received", subject: { caseId, documentId: id, detected: kind }, inputsRef: [sha] });
      return id;
    });
  }
  if (kind !== "text") {
    await withTenant(s.sql, tctx, async (tx) => {
      const dup = await tx`select 1 from exceptions where document_id = ${documentId} and kind = 'ocr_required'`;
      if (dup.length === 0) await flagUnreadable(tx, s.tenantId, caseId, documentId!, kind);
    });
    return { status: 202, body: { documentId, ingested: false, reason: "ocr_required" } };
  }
  const pages = bytes.toString("utf8").split("\f");
  const r = await ingestDocument(s.sql, s.gateway, new Date(), tctx, { caseId, documentId, docVersion: 1, docType: docType as DocType, pages });
  inc("documents_total", { ingested: String(!r.skipped) });
  return { status: r.skipped ? 200 : 201, body: { documentId, ingested: !r.skipped, factsProposed: r.factsProposed, factsAccepted: r.factsAccepted, exceptions: r.exceptions } };
}
