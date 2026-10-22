import { createHash } from "node:crypto";
import { encrypt, type KeyProvider } from "../crypto/fieldCrypto";
import type { Tx } from "../db/client";
import { appendAudit, createCase } from "../db/repo";
import { ApplicationInput } from "./schema";

/** Validates, encrypts the EIN with the tenant key, creates the case and application, and audits it, all in one transaction. */
export async function submitApplication(tx: Tx, keys: KeyProvider, tenantId: string, raw: unknown): Promise<{ caseId: string; applicationId: string; created: boolean }> {
  const a = ApplicationInput.parse(raw);
  const digits = a.ein.replace("-", "");
  const key = `app|${tenantId}|${digits}|${a.legalName.toLowerCase()}|${a.loanAmount}`;
  // derived from a hash of ALL identifying inputs: identical resubmissions return the same case, anything different gets its own
  const caseRef = `APP-${digits.slice(-4)}-${createHash("sha256").update(key).digest("hex").slice(0, 12)}`;
  const c = await createCase(tx, tenantId, { caseRef, docHashes: [] });
  if (!c.created) {
    const [row] = await tx<{ id: string }[]>`select id from applications where case_id = ${c.id}`;
    if (row) return { caseId: c.id, applicationId: row.id, created: false };
  }
  const cipher = await encrypt(keys, tenantId, "application.ein", Buffer.from(digits));
  const [row] = await tx<{ id: string }[]>`
    insert into applications (tenant_id, case_id, legal_name, entity_type, ein_last4, ein_ciphertext, naics, years_in_business, requested_term_months, loan_amount_cents, purposes, owners)
    values (${tenantId}, ${c.id}, ${a.legalName}, ${a.entityType}, ${digits.slice(-4)}, ${cipher}, ${a.naics}, ${a.yearsInBusiness}, ${a.requestedTermMonths}, ${a.loanAmount.toString()}, ${a.purposes}, ${tx.json(a.owners as never)})
    returning id`;
  await appendAudit(tx, tenantId, { actorKind: "user", actorId: "borrower", action: "application.submitted", subject: { caseId: c.id, applicationId: row!.id } });
  return { caseId: c.id, applicationId: row!.id, created: true };
}
