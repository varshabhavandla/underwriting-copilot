import type { Tx } from "../db/client";

/** The file is stored but could not be read by a program: raise a manual-review exception and extract nothing. */
export async function flagUnreadable(tx: Tx, tenantId: string, caseId: string, documentId: string, kind: string, why?: string): Promise<void> {
  await tx`insert into exceptions (tenant_id, case_id, document_id, kind, severity, detail)
           values (${tenantId}, ${caseId}, ${documentId}, 'ocr_required', 'medium', ${why ?? `no reader is available for ${kind} files; needs manual review`})`;
}
