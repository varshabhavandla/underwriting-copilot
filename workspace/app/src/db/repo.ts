import { createHash } from "node:crypto";
import { z } from "zod";
import type { Tx } from "./client";

const CaseInput = z.object({
  caseRef: z.string().min(1).max(200),
  docHashes: z.array(z.string().regex(/^[0-9a-f]{64}$/)).max(500),
});

/** Same inputs always give the same key, so a retried job returns the existing case. */
export function idemKey(tenantId: string, caseRef: string, docHashes: string[]): string {
  return createHash("sha256").update([tenantId, caseRef, ...[...docHashes].sort()].join("|")).digest("hex");
}

export async function createCase(tx: Tx, tenantId: string, input: unknown): Promise<{ id: string; created: boolean }> {
  const { caseRef, docHashes } = CaseInput.parse(input);
  const key = idemKey(tenantId, caseRef, docHashes);
  const inserted = await tx<{ id: string }[]>`
    insert into cases (tenant_id, case_ref, idem_key) values (${tenantId}, ${caseRef}, ${key})
    on conflict (tenant_id, idem_key) do nothing returning id`;
  if (inserted[0]) return { id: inserted[0].id, created: true };
  const [existing] = await tx<{ id: string }[]>`select id from cases where tenant_id = ${tenantId} and idem_key = ${key}`;
  if (!existing) throw new Error("case not found after conflict");
  return { id: existing.id, created: false };
}

const DocInput = z.object({
  caseId: z.string().uuid(),
  docType: z.string().min(1),
  contentSha256: z.string().regex(/^[0-9a-f]{64}$/),
  storageKey: z.string().min(1),
  version: z.number().int().positive().default(1),
});

export async function addDocument(tx: Tx, tenantId: string, input: unknown): Promise<string> {
  const d = DocInput.parse(input);
  const [row] = await tx<{ id: string }[]>`
    insert into documents (tenant_id, case_id, doc_type, version, content_sha256, storage_key)
    values (${tenantId}, ${d.caseId}, ${d.docType}, ${d.version}, ${d.contentSha256}, ${d.storageKey}) returning id`;
  return row!.id;
}

const FactInput = z.object({
  caseId: z.string().uuid(),
  key: z.string().min(1),
  value: z.string().min(1),
  citation: z.object({
    docId: z.string().uuid(),
    docVersion: z.number().int().positive(),
    page: z.number().int().positive(),
    passage: z.string().min(1),
  }),
  evidence: z.record(z.string(), z.unknown()).default({}),
  evidenceScore: z.number().min(0).max(1).default(0),
});

export async function proposeFact(tx: Tx, tenantId: string, input: unknown): Promise<string> {
  const f = FactInput.parse(input);
  const [row] = await tx<{ id: string }[]>`
    insert into facts (tenant_id, case_id, key, value, doc_id, doc_version, page, passage, evidence, evidence_score)
    values (${tenantId}, ${f.caseId}, ${f.key}, ${f.value}, ${f.citation.docId}, ${f.citation.docVersion}, ${f.citation.page}, ${f.citation.passage}, ${tx.json(f.evidence as never)}, ${f.evidenceScore})
    returning id`;
  return row!.id;
}

const DecisionInput = z.object({
  caseId: z.string().uuid(),
  userId: z.string().uuid(),
  decision: z.enum(["approve", "decline", "request_more_info"]),
  reasons: z.array(z.string().min(1)).min(1),
  policyVersion: z.string().min(1),
  overrides: z.array(z.string()).default([]),
});

/** Records the decision. The database requires userId to be the session user and an underwriter of this tenant. */
export async function recordDecision(tx: Tx, tenantId: string, input: unknown): Promise<string> {
  const d = DecisionInput.parse(input);
  const [row] = await tx<{ id: string }[]>`
    insert into decisions (tenant_id, case_id, decided_by, decision, reasons, policy_version, overrides)
    values (${tenantId}, ${d.caseId}, ${d.userId}, ${d.decision}, ${d.reasons}, ${d.policyVersion}, ${d.overrides}) returning id`;
  return row!.id;
}

export async function setCaseStatus(tx: Tx, caseId: string, status: string): Promise<void> {
  await tx`update cases set status = ${status} where id = ${caseId}`;
}

export async function appendAudit(
  tx: Tx,
  tenantId: string,
  e: { actorKind: "user" | "agent" | "system"; actorId: string; action: string; subject?: object; inputsRef?: string[]; result?: "ok" | "rejected" | "error"; rule?: object; llm?: object },
): Promise<void> {
  await tx`
    insert into audit_events (tenant_id, seq, prev_hash, hash, at, actor_kind, actor_id, action, subject, inputs_ref, rule, llm, result)
    values (${tenantId}, 0, '', '', now(), ${e.actorKind}, ${e.actorId}, ${e.action}, ${tx.json((e.subject ?? {}) as never)}, ${e.inputsRef ?? []},
            ${e.rule ? tx.json(e.rule as never) : null}, ${e.llm ? tx.json(e.llm as never) : null}, ${e.result ?? "ok"})`;
}

export async function verifyAuditChain(tx: Tx): Promise<number | null> {
  const [row] = await tx<{ audit_verify_chain: string | null }[]>`select audit_verify_chain()`;
  return row?.audit_verify_chain == null ? null : Number(row.audit_verify_chain);
}
