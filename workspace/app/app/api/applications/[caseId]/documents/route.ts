import { withTenant } from "@/db/client";
import { addDocument, appendAudit } from "@/db/repo";
import { DOC_TYPES, type DocType } from "@/extraction/schemas";
import { ingestDocument } from "@/ingest/ingest";
import { objectKey, sha256Hex } from "@/storage/objectStore";
import { UploadRejected, validateUpload } from "@/storage/validateUpload";
import { services } from "@/server/services";

export const dynamic = "force-dynamic";
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Development upload path (multipart, capped below the hosting body limit). Production uploads go directly to object storage with a
 * signed URL. Content type is decided by content, not by file name. Only text documents are ingested; PDFs and images are stored and
 * routed to manual review because no OCR provider is wired yet.
 */
export async function POST(req: Request, ctx: { params: Promise<{ caseId: string }> }): Promise<Response> {
  const s = services();
  if (!s) return Response.json({ error: "unauthenticated" }, { status: 401 });
  const { caseId } = await ctx.params;
  if (!UUID.test(caseId)) return Response.json({ error: "not found" }, { status: 404 });
  const form = await req.formData().catch(() => null);
  const file = form?.get("file");
  const docType = String(form?.get("docType") ?? "");
  if (!(file instanceof File) || !(DOC_TYPES as string[]).includes(docType)) return Response.json({ error: "file and a valid docType are required" }, { status: 400 });
  const bytes = Buffer.from(await file.arrayBuffer());
  let kind;
  try {
    kind = validateUpload(bytes);
  } catch (e) {
    if (e instanceof UploadRejected) return Response.json({ error: e.message }, { status: 415 });
    throw e;
  }
  const sha = sha256Hex(bytes);
  const tctx = { tenantId: s.tenantId, ...(s.userId ? { userId: s.userId } : {}) };
  const exists = await withTenant(s.sql, tctx, (tx) => tx`select 1 from cases where id = ${caseId}`);
  if (exists.length === 0) return Response.json({ error: "not found" }, { status: 404 }); // same answer for missing and foreign cases

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
    await withTenant(s.sql, tctx, (tx) => tx`insert into exceptions (tenant_id, case_id, document_id, kind, severity, detail) values (${s.tenantId}, ${caseId}, ${documentId}, 'ocr_required', 'medium', ${"no text layer reader is configured for " + kind + " files; needs manual review"}) on conflict do nothing`);
    return Response.json({ documentId, ingested: false, reason: "ocr_required" }, { status: 202 });
  }
  const pages = bytes.toString("utf8").split("\f");
  const r = await ingestDocument(s.sql, s.gateway, new Date(), tctx, { caseId, documentId, docVersion: 1, docType: docType as DocType, pages });
  return Response.json({ documentId, ingested: !r.skipped, factsProposed: r.factsProposed, factsAccepted: r.factsAccepted, exceptions: r.exceptions }, { status: r.skipped ? 200 : 201 });
}
