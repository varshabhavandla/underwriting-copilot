import { formatCents, parseAmountToCents } from "./money.js";
import type { ChecklistResult, Fact, RuleResult } from "./models.js";

/**
 * PLACEHOLDER rules. The real checklist is derived from SBA SOP 50 10 8.1 and
 * lender policy (see workspace/docs/SBA_PROCESS_MAP.md); every rule must cite
 * its SOP section and version before it ships.
 */
export interface Checklist {
  version: string;
  requiredDocuments: string[];
  requiredFacts: string[];
  maxRequestedAmountCents: bigint;
}

export const CHECKLIST_V1: Checklist = {
  version: "1.0.0-placeholder",
  requiredDocuments: ["application_form", "identity_document", "income_statement"],
  requiredFacts: ["applicant_name", "requested_amount"],
  maxRequestedAmountCents: 100_000_00n,
};

export function evaluate(cl: Checklist, facts: Fact[]): ChecklistResult {
  const values = new Map<string, Set<string>>();
  for (const f of facts) {
    const set = values.get(f.key) ?? new Set<string>();
    set.add(f.value);
    values.set(f.key, set);
  }

  const results: RuleResult[] = [];
  for (const key of cl.requiredFacts) {
    const ok = values.has(key);
    results.push({
      ruleId: `fact_present:${key}`,
      outcome: ok ? "pass" : "fail",
      inputs: { key },
      detail: ok ? "found" : "no extracted value",
    });
  }

  const vals = [...(values.get("requested_amount") ?? [])].sort();
  const cents = vals.map(parseAmountToCents);
  const single = vals.length === 1 ? cents[0] : undefined;
  if (single === undefined || single === null) {
    results.push({
      ruleId: "amount_within_limit",
      outcome: "needs_review",
      inputs: { values: vals },
      detail: "absent, unparseable or conflicting",
    });
  } else {
    const ok = single <= cl.maxRequestedAmountCents;
    results.push({
      ruleId: "amount_within_limit",
      outcome: ok ? "pass" : "fail",
      inputs: { amount: formatCents(single), max: formatCents(cl.maxRequestedAmountCents) },
      detail: ok ? "within limit" : "exceeds limit",
    });
  }

  return {
    policyVersion: cl.version,
    results,
    passed: results.every((r) => r.outcome === "pass"),
  };
}
