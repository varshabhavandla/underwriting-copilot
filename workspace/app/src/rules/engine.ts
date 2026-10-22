import type { RuleCtx, RulePack, RuleResult } from "./types";

/** Runs every rule. A rule that throws fails closed as needs_review, never as pass. */
export function runPack(pack: RulePack, ctx: RuleCtx): RuleResult[] {
  return pack.rules.map((r): RuleResult => {
    const base = { ruleId: r.id, sopSection: r.sop.section };
    if (r.applies && !r.applies(ctx)) return { ...base, outcome: "not_applicable", detail: "rule does not apply to this application", inputs: {}, factIds: [] };
    try {
      const out = r.evaluate(ctx);
      return { ...base, outcome: out.outcome, detail: out.detail, inputs: out.inputs ?? {}, factIds: out.factIds ?? [] };
    } catch (e) {
      return { ...base, outcome: "needs_review", detail: `rule could not be evaluated: ${(e as Error).message}`, inputs: {}, factIds: [] };
    }
  });
}
