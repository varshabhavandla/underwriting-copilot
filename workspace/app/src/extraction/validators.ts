import { fieldKey, type DocType } from "./schemas";

export interface FactView {
  docId: string;
  docType: DocType;
  field: string;
  canonicalValue: string;
}

export interface ValidationIssue {
  kind: "bank_arithmetic" | "balance_sheet_imbalance" | "income_mismatch" | "stale_document";
  severity: "critical" | "high" | "medium" | "low";
  detail: string;
  /** Facts whose acceptance this issue blocks. */
  blocks: { docId: string; field: string }[];
}

const val = (facts: FactView[], docId: string, field: string): bigint | undefined => {
  const f = facts.find((x) => x.docId === docId && x.field === field);
  return f ? BigInt(f.canonicalValue) : undefined;
};
const byType = (facts: FactView[], t: DocType) => [...new Set(facts.filter((f) => f.docType === t).map((f) => f.docId))];

export const STALE_DAYS = 120; // SBA SOP 50 10 8.1 App. 20: business financial statements dated within 120 days of submission
export const INCOME_TOLERANCE_PERCENT = 5n; // placeholder tolerance, to be set from lender policy

/** Pure functions over extracted facts. No model output is trusted for arithmetic or comparisons. */
export function validate(facts: FactView[], asOf: Date): ValidationIssue[] {
  const issues: ValidationIssue[] = [];

  for (const id of byType(facts, "bank_statement")) {
    const b = val(facts, id, "beginning_balance"), d = val(facts, id, "total_deposits"), w = val(facts, id, "total_withdrawals"), e = val(facts, id, "ending_balance");
    if (b !== undefined && d !== undefined && w !== undefined && e !== undefined && b + d - w !== e) {
      issues.push({
        kind: "bank_arithmetic", severity: "high",
        detail: `beginning + deposits - withdrawals = ${b + d - w} cents, statement ending balance = ${e} cents`,
        blocks: ["beginning_balance", "total_deposits", "total_withdrawals", "ending_balance"].map((field) => ({ docId: id, field })),
      });
    }
  }

  for (const id of byType(facts, "financial_statement")) {
    const a = val(facts, id, "total_assets"), l = val(facts, id, "total_liabilities"), q = val(facts, id, "total_equity");
    if (a !== undefined && l !== undefined && q !== undefined && a !== l + q) {
      issues.push({
        kind: "balance_sheet_imbalance", severity: "high",
        detail: `assets ${a} cents differs from liabilities + equity ${l + q} cents`,
        blocks: ["total_assets", "total_liabilities", "total_equity"].map((field) => ({ docId: id, field })),
      });
    }
    const dateFact = facts.find((x) => x.docId === id && x.field === "statement_date");
    if (dateFact) {
      const age = Math.floor((asOf.getTime() - Date.parse(dateFact.canonicalValue + "T00:00:00Z")) / 86_400_000);
      if (age > STALE_DAYS) {
        issues.push({ kind: "stale_document", severity: "medium", detail: `statement dated ${dateFact.canonicalValue} is ${age} days old (limit ${STALE_DAYS})`, blocks: [{ docId: id, field: "statement_date" }] });
      }
    }
  }

  // reconcile the most recent tax return net income with the financial statement net income
  const fsIds = byType(facts, "financial_statement");
  const years = byType(facts, "tax_return").map((id) => ({ id, year: Number(facts.find((f) => f.docId === id && f.field === "tax_year")?.canonicalValue ?? -1) }));
  const latest = years.length ? Math.max(...years.map((y) => y.year)) : -1;
  const trIds = years.filter((y) => y.year === latest || years.length === 1).map((y) => y.id);
  for (const fs of fsIds) for (const tr of trIds) {
    const a = val(facts, fs, "net_income"), b = val(facts, tr, "net_income");
    if (a === undefined || b === undefined) continue;
    const diff = a > b ? a - b : b - a;
    const base = (b < 0n ? -b : b) || 1n;
    if (diff * 100n > base * INCOME_TOLERANCE_PERCENT) {
      issues.push({
        kind: "income_mismatch", severity: "medium",
        detail: `${fieldKey("financial_statement", "net_income")} ${a} cents vs ${fieldKey("tax_return", "net_income")} ${b} cents differ by more than ${INCOME_TOLERANCE_PERCENT}%`,
        blocks: [{ docId: fs, field: "net_income" }, { docId: tr, field: "net_income" }],
      });
    }
  }
  return issues;
}
