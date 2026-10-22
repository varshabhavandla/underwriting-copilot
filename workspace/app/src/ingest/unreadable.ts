import type { Tx } from "../db/client";

/** PDFs and images have no text layer reader yet: store them, raise a manual-review exception, extract nothing. */
export async function flagUnreadable(tx: Tx, tenantId: string, caseId: string, documentId: string, kind: string): Promise<void> {
  await tx`insert into exceptions (tenant_id, case_id, document_id, kind, severity, detail)
           values (${tenantId}, ${caseId}, ${documentId}, 'ocr_required', 'medium', ${"no text layer reader is configured for " + kind + " files; needs manual review"})`;
}
