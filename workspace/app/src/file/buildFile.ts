import { canonical } from "../extraction/normalize";
import { fieldKey, specFor, type DocType } from "../extraction/schemas";
import { withTenant, type Sql, type TenantContext, type Tx } from "../db/client";
import { appendAudit } from "../db/repo";
import type { LlmGateway } from "../llm/gateway";
import type { MemoProblem, MemoSource } from "../memo/types";
import { fmtMilli, fmtUsd } from "../rules/calc";
import { runPack } from "../rules/engine";
import { SBA_7A_PACK } from "../rules/sba7a";
import type { AcceptedFact, AppView, LenderOverlay, RulePack, RuleResult } from "../rules/types";

export const DEFAULT_OVERLAY: LenderOverlay = { assumedAnnualRatePercent: 9 }; // PLACEHOLDER lender policy input, labeled in every result

export interface BuildResult {
  runId: string;
  results: RuleResult[];
  memoStored: boolean;
  memoProblems: MemoProblem[];
  exceptionsRaised: string[];
}

const NUMBER = /\d{4}-\d{2}-\d{2}|\$?\d[\d,]*(?:\.\d+)?%?/g;
const tokens = (s: string): string[] => s.match(NUMBER) ?? [];

async function loadInputs(tx: Tx, caseId: string): Promise<{ app: AppView; docs: { id: string; type: DocType }[]; facts: AcceptedFact[] }> {
  const [a] = await tx<{ legal_name: string; entity_type: string; naics: string; years_in_business: number; requested_term_months: number | null; loan_amount_cents: string; purposes: string[]; owners: { name: string; percent: number }[] }[]>`
    select legal_name, entity_type, naics, years_in_business, requested_term_months, loan_amount_cents::text, purposes, owners from applications where case_id = ${caseId}`;
  if (!a) throw new Error("no application for this case");
  const docs = await tx<{ id: string; doc_type: DocType }[]>`select id, doc_type from documents where case_id = ${caseId}`;
  const rows = await tx<{ id: string; doc_id: string; key: string; value: string; doc_type: DocType }[]>`
    select f.id, f.doc_id, f.key, f.value, d.doc_type from facts f join documents d on d.id = f.doc_id and d.tenant_id = f.tenant_id
    where f.case_id = ${caseId} and f.status = 'accepted'`;
  const facts: AcceptedFact[] = [];
  for (const r of rows) {
    const field = r.key.split(".")[1]!;
    const spec = specFor(r.doc_type, field);
    const canon = spec ? canonical(spec.kind, r.value) : null;
    if (canon !== null) facts.push({ id: r.id, docId: r.doc_id, docType: r.doc_type, field, value: r.value, canonicalValue: canon });
  }
  return {
    app: { legalName: a.legal_name, entityType: a.entity_type, naics: a.naics, yearsInBusiness: a.years_in_business, requestedTermMonths: a.requested_term_months ?? 0, loanAmountCents: BigInt(a.loan_amount_cents), purposes: a.purposes, owners: a.owners },
    docs: docs.map((d) => ({ id: d.id, type: d.doc_type })),
    facts,
  };
}

const usd = (f: AcceptedFact) => fmtUsd(BigInt(f.canonicalValue));

function buildSources(app: AppView, facts: AcceptedFact[], results: RuleResult[], pack: RulePack, openExceptions: { id: string; kind: string; severity: string; detail: string }[], overlay: LenderOverlay): MemoSource[] {
  const src: MemoSource[] = [];
  const add = (id: string, label: string, text: string, renderings: string[]) => src.push({ id, label, text, renderings });
  add("A:name", "Business name", `Legal business name: ${app.legalName}.`, tokens(app.legalName));
  add("A:loan_amount", "Requested amount", `Requested loan amount is ${fmtUsd(app.loanAmountCents)}.`, [fmtUsd(app.loanAmountCents)]);
  add("A:term", "Requested term", `Requested term is ${app.requestedTermMonths} months.`, [String(app.requestedTermMonths)]);
  add("A:purposes", "Purposes", `Stated purposes: ${app.purposes.map((p) => p.replace(/_/g, " ")).join(", ")}.`, []);
  add("A:years", "Years in business", `The applicant reports ${app.yearsInBusiness} years in business.`, [String(app.yearsInBusiness)]);
  add("A:owners", "Ownership", `Listed ownership: ${app.owners.map((o) => `${o.name} ${o.percent}%`).join(", ")}.`, app.owners.map((o) => `${o.percent}%`));

  const years = facts.filter((f) => f.docType === "tax_return" && f.field === "tax_year").map((f) => ({ docId: f.docId, year: f.canonicalValue })).sort((a, b) => (a.year < b.year ? 1 : -1));
  const latest = years[0];
  if (latest) {
    for (const [field, label] of [["gross_receipts", "Gross receipts"], ["net_income", "Net income"], ["interest_expense", "Interest expense"], ["depreciation", "Depreciation"]] as const) {
      const f = facts.find((x) => x.docId === latest.docId && x.field === field);
      if (f) add(`F:${f.id}`, fieldKey("tax_return", field), `${label} on the ${latest.year} tax return is ${usd(f)}.`, [usd(f), latest.year]);
    }
  }
  const fsDoc = facts.find((f) => f.docType === "financial_statement" && f.field === "statement_date");
  if (fsDoc) {
    const dateText = fsDoc.canonicalValue;
    for (const [field, label] of [["revenue", "Revenue"], ["net_income", "Net income"], ["total_assets", "Total assets"], ["total_liabilities", "Total liabilities"], ["total_equity", "Total equity"]] as const) {
      const f = facts.find((x) => x.docId === fsDoc.docId && x.field === field);
      if (f) add(`F:${f.id}`, fieldKey("financial_statement", field), `${label} on the financial statement dated ${dateText} is ${usd(f)}.`, [usd(f), dateText]);
    }
  }
  const dsc = results.find((r) => r.ruleId === "debt-service-coverage");
  const ins = dsc?.inputs as { ebitdaCents?: string; annualDebtServiceCents?: string; dscMilli?: string | null } | undefined;
  if (ins?.ebitdaCents && ins.annualDebtServiceCents) {
    add("C:ebitda", "EBITDA", `Calculated EBITDA from the latest tax return is ${fmtUsd(BigInt(ins.ebitdaCents))}.`, [fmtUsd(BigInt(ins.ebitdaCents))]);
    add("C:debt_service", "Debt service", `Estimated annual debt service on the new loan is ${fmtUsd(BigInt(ins.annualDebtServiceCents))} at an assumed ${overlay.assumedAnnualRatePercent}% placeholder rate.`, [fmtUsd(BigInt(ins.annualDebtServiceCents)), `${overlay.assumedAnnualRatePercent}%`]);
    if (ins.dscMilli) add("C:dsc", "DSC", `Indicative coverage on the new loan alone is ${fmtMilli(BigInt(ins.dscMilli))}.`, [fmtMilli(BigInt(ins.dscMilli))]);
  }
  for (const r of results.filter((x) => x.outcome !== "not_applicable")) {
    const text = `${r.ruleId} (${r.sopSection}): ${r.outcome.replace("_", " ")}. ${r.detail}.`;
    add(`R:${r.ruleId}`, r.ruleId, text, tokens(text));
  }
  for (const e of openExceptions) {
    const text = `Open exception ${e.kind} (${e.severity}): ${e.detail}.`;
    add(`X:${e.id}`, e.kind, text, tokens(text));
  }
  pack.notEvaluated.forEach((n, i) => {
    const text = `Not evaluated by this tool: ${n.item} (${n.reason}).`;
    add(`N:${i + 1}`, n.item, text, tokens(text));
  });
  return src;
}

async function raise(tx: Tx, tenantId: string, caseId: string, kind: string, severity: string, detail: string): Promise<boolean> {
  const dup = await tx`select 1 from exceptions where case_id = ${caseId} and kind = ${kind} and detail = ${detail}`;
  if (dup.length) return false;
  await tx`insert into exceptions (tenant_id, case_id, kind, severity, detail) values (${tenantId}, ${caseId}, ${kind}, ${severity}, ${detail})`;
  await appendAudit(tx, tenantId, { actorKind: "system", actorId: "rules", action: "exception.raised", subject: { caseId, kind, severity } });
  return true;
}

/**
 * Evaluates the rule pack against the accepted facts and the application, records an append-only run, raises exceptions for every rule that
 * is not a pass, drafts a memo from numbered sources, verifies it, stores it only if every line checks out, and leaves the case in needs_review.
 * It never approves or declines anything.
 */
export async function buildFile(sql: Sql, gateway: LlmGateway, ctx: TenantContext, caseId: string, asOf: Date, overlay: LenderOverlay = DEFAULT_OVERLAY, pack: RulePack = SBA_7A_PACK): Promise<BuildResult> {
  const { tenantId } = ctx;
  const inputs = await withTenant(sql, ctx, (tx) => loadInputs(tx, caseId));
  const results = runPack(pack, { app: inputs.app, facts: inputs.facts, docs: inputs.docs, asOf, overlay });

  const raised: string[] = [];
  const stage1 = await withTenant(sql, ctx, async (tx) => {
    const [run] = await tx<{ id: string }[]>`insert into rule_runs (tenant_id, case_id, pack, pack_version) values (${tenantId}, ${caseId}, ${pack.name}, ${pack.version}) returning id`;
    for (const r of results) {
      await tx`insert into rule_results (tenant_id, run_id, case_id, rule_id, sop_section, outcome, detail, inputs, fact_ids)
               values (${tenantId}, ${run!.id}, ${caseId}, ${r.ruleId}, ${r.sopSection}, ${r.outcome}, ${r.detail}, ${tx.json(r.inputs as never)}, ${r.factIds})`;
      await appendAudit(tx, tenantId, { actorKind: "system", actorId: "rules", action: "rule.evaluated", subject: { caseId, outcome: r.outcome }, inputsRef: r.factIds, rule: { pack: pack.name, version: pack.version, sopSection: r.sopSection, id: r.ruleId }, result: r.outcome === "fail" ? "rejected" : "ok" });
      if (r.outcome === "fail" || r.outcome === "needs_review") {
        if (await raise(tx, tenantId, caseId, `rule:${r.ruleId}`, r.outcome === "fail" ? "high" : "medium", r.detail)) raised.push(`rule:${r.ruleId}`);
      }
    }
    const open = await tx<{ id: string; kind: string; severity: string; detail: string }[]>`select id, kind, severity, detail from exceptions where case_id = ${caseId} and status = 'open' and kind not like 'rule:%' order by created_at`;
    return { runId: run!.id, open };
  });

  const sources = buildSources(inputs.app, inputs.facts, results, pack, stage1.open, overlay);
  let problems: MemoProblem[] = [];
  let draft: Awaited<ReturnType<LlmGateway["draftMemo"]>> | undefined;
  let error: string | undefined;
  try {
    draft = await gateway.draftMemo(caseId, inputs.app.legalName, sources);
    problems = draft.problems;
  } catch (e) {
    error = (e as Error).message;
  }

  const memoStored = await withTenant(sql, ctx, async (tx) => {
    let stored = false;
    if (draft) {
      const c = draft.call;
      await appendAudit(tx, tenantId, { actorKind: "agent", actorId: c.provider, action: "llm.call", subject: { caseId, task: "draft_memo" }, llm: { provider: c.provider, model: c.model, promptVersion: c.promptVersion, inputHash: c.inputHash, outputHash: c.outputHash, tokensEstimate: c.tokensEstimate, redactedItems: c.redactedItems }, result: c.result });
      if (draft.draft) {
        await tx`insert into memos (tenant_id, case_id, run_id, sections, drafted_by) values (${tenantId}, ${caseId}, ${stage1.runId}, ${tx.json(draft.draft.sections as never)}, ${c.provider + ":" + c.promptVersion})`;
        await appendAudit(tx, tenantId, { actorKind: "agent", actorId: c.provider, action: "memo.drafted", subject: { caseId, runId: stage1.runId } });
        stored = true;
      } else {
        const why = c.result === "error" ? (c.error ?? "provider error") : problems.slice(0, 3).map((p) => `${p.section}#${p.line} ${p.kind}`).join("; ");
        if (await raise(tx, tenantId, caseId, "memo_unverified", "high", `memo draft rejected: ${why}`)) raised.push("memo_unverified");
      }
    } else if (error) {
      if (await raise(tx, tenantId, caseId, "memo_unverified", "high", `memo not drafted: ${error}`)) raised.push("memo_unverified");
    }
    await tx`update cases set status = 'needs_review' where id = ${caseId} and status in ('received','processing','info_requested','needs_review')`;
    return stored;
  });
  return { runId: stage1.runId, results, memoStored, memoProblems: problems, exceptionsRaised: raised };
}
