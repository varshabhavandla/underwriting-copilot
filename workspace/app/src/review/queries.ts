import type { Tx } from "../db/client";

export interface CaseRow { id: string; case_ref: string; status: string; legal_name: string | null; loan_amount_cents: string | null; open_critical: number; open_high: number; open_other: number; has_memo: boolean }

export async function listCases(tx: Tx): Promise<CaseRow[]> {
  return tx<CaseRow[]>`
    select c.id, c.case_ref, c.status, a.legal_name, a.loan_amount_cents::text,
      (select count(*)::int from exceptions e where e.case_id = c.id and e.status = 'open' and e.severity = 'critical') as open_critical,
      (select count(*)::int from exceptions e where e.case_id = c.id and e.status = 'open' and e.severity = 'high') as open_high,
      (select count(*)::int from exceptions e where e.case_id = c.id and e.status = 'open' and e.severity in ('medium','low')) as open_other,
      exists (select 1 from memos m where m.case_id = c.id) as has_memo
    from cases c left join applications a on a.case_id = c.id
    order by (c.status = 'needs_review') desc, c.created_at desc limit 100`;
}

export interface Detail {
  caseRow: { id: string; case_ref: string; status: string };
  application: { legal_name: string; entity_type: string; ein_last4: string; naics: string; years_in_business: number; requested_term_months: number | null; loan_amount_cents: string; purposes: string[]; owners: { name: string; percent: number }[] } | undefined;
  documents: { id: string; doc_type: string; version: number }[];
  facts: { id: string; key: string; value: string; status: string; evidence_score: string; page: number; passage: string; doc_type: string }[];
  exceptions: { id: string; kind: string; severity: string; detail: string; status: string; disposition_note: string | null }[];
  rules: { rule_id: string; sop_section: string; outcome: string; detail: string }[];
  memo: { id: string; sections: { title: string; lines: { text: string; cites: string[] }[] }[]; adopted: boolean } | undefined;
  decisions: { decision: string; reasons: string[]; overrides: string[]; policy_version: string; created_at: string }[];
  audit: { seq: string; action: string; actor_kind: string; at: string }[];
}

export async function caseDetail(tx: Tx, caseId: string): Promise<Detail | undefined> {
  const [caseRow] = await tx<Detail["caseRow"][]>`select id, case_ref, status from cases where id = ${caseId}`;
  if (!caseRow) return undefined;
  const [application] = await tx<NonNullable<Detail["application"]>[]>`select legal_name, entity_type, ein_last4, naics, years_in_business, requested_term_months, loan_amount_cents::text, purposes, owners from applications where case_id = ${caseId}`;
  const documents = await tx<Detail["documents"]>`select id, doc_type, version from documents where case_id = ${caseId} order by created_at`;
  const facts = await tx<Detail["facts"]>`
    select f.id, f.key, f.value, f.status, f.evidence_score::text, f.page, f.passage, d.doc_type
    from facts f join documents d on d.id = f.doc_id and d.tenant_id = f.tenant_id where f.case_id = ${caseId} order by f.key, f.created_at`;
  const exceptions = await tx<Detail["exceptions"]>`
    select id, kind, severity, detail, status, disposition_note from exceptions where case_id = ${caseId}
    order by array_position(array['critical','high','medium','low'], severity), created_at`;
  const rules = await tx<Detail["rules"]>`
    select rule_id, sop_section, outcome, detail from rule_results where run_id = (select id from rule_runs where case_id = ${caseId} order by created_at desc limit 1) order by rule_id`;
  const [m] = await tx<{ id: string; sections: Detail["memo"] extends infer M ? (M extends { sections: infer S } ? S : never) : never }[]>`select id, sections from memos where case_id = ${caseId} order by created_at desc limit 1`;
  const adopted = m ? (await tx`select 1 from memo_adoptions where memo_id = ${m.id}`).length > 0 : false;
  const decisions = await tx<Detail["decisions"]>`select decision, reasons, overrides, policy_version, created_at::text from decisions where case_id = ${caseId} order by created_at`;
  const audit = await tx<Detail["audit"]>`select seq::text, action, actor_kind, at::text from audit_events where subject->>'caseId' = ${caseId} order by seq desc limit 40`;
  return { caseRow, application, documents, facts, exceptions, rules, memo: m ? { id: m.id, sections: m.sections, adopted } : undefined, decisions, audit };
}

/** Human-readable label for a memo citation id, resolved against the case data. */
export function describeCite(id: string, d: Detail): string {
  const [kind, rest] = [id.slice(0, 1), id.slice(2)];
  if (kind === "F") { const f = d.facts.find((x) => x.id === rest); return f ? `${f.key} = ${f.value} (p.${f.page})` : `fact ${rest} (not found)`; }
  if (kind === "X") { const e = d.exceptions.find((x) => x.id === rest); return e ? `exception ${e.kind} (${e.severity})` : `exception ${rest} (not found)`; }
  if (kind === "R") return `rule ${rest}`;
  if (kind === "C") return `calculation ${rest}`;
  if (kind === "A") return `application ${rest}`;
  if (kind === "N") return `not evaluated #${rest}`;
  return id;
}
