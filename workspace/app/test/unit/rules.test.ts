import { describe, expect, it } from "vitest";
import { annualDebtServiceCents, dscMilli, ebitdaCents, fmtMilli, fmtUsd, monthlyPaymentCents } from "../../src/rules/calc";
import { runPack } from "../../src/rules/engine";
import { SBA_7A_PACK, rules } from "../../src/rules/sba7a";
import type { AcceptedFact, AppView, RuleCtx, RulePack } from "../../src/rules/types";

const ASOF = new Date("2026-10-21T00:00:00Z");
const d = (n: number) => new Date(ASOF.getTime() - n * 86_400_000).toISOString().slice(0, 10);
const usd = (n: number) => BigInt(Math.round(n * 100));

describe("calculators", () => {
  it("monthly payment matches a known value ($100,000, 6%, 10 years = $1,110.21)", () => {
    expect(monthlyPaymentCents(usd(100_000), 6, 120)).toBe(111_021n);
  });
  it("a loan amortizes to about zero when paid at the computed payment (independent simulation)", () => {
    for (const [p, r, n] of [[250_000, 9, 120], [75_000, 7.25, 60], [1_000_000, 11.5, 300]] as const) {
      const pay = Number(monthlyPaymentCents(usd(p), r, n)) / 100;
      let bal = p;
      for (let i = 0; i < n; i++) bal = bal * (1 + r / 1200) - pay;
      expect(Math.abs(bal)).toBeLessThan(n * 0.01 + 1); // rounding to cents each month only
    }
  });
  it("zero rate divides evenly, and invalid inputs throw", () => {
    expect(monthlyPaymentCents(120_000n, 0, 12)).toBe(10_000n);
    expect(() => monthlyPaymentCents(0n, 5, 12)).toThrow();
    expect(() => monthlyPaymentCents(1000n, 5, 0)).toThrow();
    expect(() => monthlyPaymentCents(1000n, -1, 12)).toThrow();
  });
  it("EBITDA, coverage and formatting", () => {
    expect(ebitdaCents(100n, 20n, 30n)).toBe(150n);
    expect(dscMilli(115n, 100n)).toBe(1150n);
    expect(dscMilli(1n, 0n)).toBeNull();
    expect(fmtMilli(1150n)).toBe("1.150");
    expect(fmtUsd(-123_456n)).toBe("-$1,234.56");
    expect(annualDebtServiceCents(usd(100_000), 6, 120)).toBe(111_021n * 12n);
  });
});

const app = (o: Partial<AppView> = {}): AppView => ({ legalName: "X", entityType: "llc", naics: "722511", yearsInBusiness: 6, requestedTermMonths: 120, loanAmountCents: usd(250_000), purposes: ["equipment"], owners: [{ name: "A", percent: 100 }], ...o });
let n = 0;
const f = (docId: string, docType: AcceptedFact["docType"], field: string, canonicalValue: string): AcceptedFact => ({ id: `f${++n}`, docId, docType, field, value: canonicalValue, canonicalValue });
const ctx = (o: Partial<RuleCtx> = {}): RuleCtx => ({ app: app(), facts: [], docs: [], asOf: ASOF, overlay: { assumedAnnualRatePercent: 9 }, ...o });
const result = (id: string, c: RuleCtx) => runPack(SBA_7A_PACK, c).find((r) => r.ruleId === id)!;
const taxDocs = (years: number[], net = usd(300_000)) => ({
  docs: years.map((y) => ({ id: `t${y}`, type: "tax_return" as const })),
  facts: years.flatMap((y) => [f(`t${y}`, "tax_return", "tax_year", String(y)), f(`t${y}`, "tax_return", "net_income", String(net)), f(`t${y}`, "tax_return", "interest_expense", String(usd(10_000))), f(`t${y}`, "tax_return", "depreciation", String(usd(20_000)))]),
});

describe("SBA 7(a) rule pack", () => {
  it("every rule cites an SOP section and version, and coverage gaps are listed", () => {
    for (const r of rules) { expect(r.sop.section.length, r.id).toBeGreaterThan(5); expect(r.sop.version, r.id).toBe("SOP 50 10 8.1"); }
    expect(SBA_7A_PACK.notEvaluated.length).toBeGreaterThan(3);
    expect(new Set(rules.map((r) => r.id)).size).toBe(rules.length);
  });
  it("loan amount: $5,000,000 passes, one cent over fails", () => {
    expect(result("loan-amount-limit", ctx({ app: app({ loanAmountCents: usd(5_000_000) }) })).outcome).toBe("pass");
    expect(result("loan-amount-limit", ctx({ app: app({ loanAmountCents: usd(5_000_000) + 1n }) })).outcome).toBe("fail");
  });
  it("guaranty percentage: 85 up to $150,000 and 75 above", () => {
    expect(result("guaranty-percentage", ctx({ app: app({ loanAmountCents: usd(150_000) }) })).inputs["percent"]).toBe(85);
    expect(result("guaranty-percentage", ctx({ app: app({ loanAmountCents: usd(150_000) + 1n }) })).inputs["percent"]).toBe(75);
    expect(result("guaranty-percentage", ctx({ app: app({ loanAmountCents: usd(5_000_000) }) })).outcome).toBe("pass"); // 75% = exactly the cap
  });
  it("ownership must total exactly 100", () => {
    expect(result("ownership-total", ctx({ app: app({ owners: [{ name: "A", percent: 60 }, { name: "B", percent: 40 }] }) })).outcome).toBe("pass");
    expect(result("ownership-total", ctx({ app: app({ owners: [{ name: "A", percent: 60 }, { name: "B", percent: 39.99 }] }) })).outcome).toBe("fail");
  });
  it("required documents: 3 distinct tax years, a financial statement, and 2 bank months for loans up to $350,000", () => {
    const full = { ...taxDocs([2025, 2024, 2023]) };
    const docs: RuleCtx["docs"] = [...full.docs, { id: "fs", type: "financial_statement" }, { id: "b1", type: "bank_statement" }, { id: "b2", type: "bank_statement" }];
    const facts = [...full.facts, f("b1", "bank_statement", "period_end", "2026-09-30"), f("b2", "bank_statement", "period_end", "2026-08-31")];
    expect(result("required-documents", ctx({ docs, facts })).outcome).toBe("pass");
    expect(result("required-documents", ctx({ docs: docs.slice(1), facts: facts.slice(4) })).detail).toMatch(/3 years/);
    const sameMonth = facts.map((x) => (x.docId === "b2" ? { ...x, canonicalValue: "2026-09-15" } : x));
    expect(result("required-documents", ctx({ docs, facts: sameMonth })).detail).toMatch(/two months/);
    // a larger loan does not need the bank statements
    expect(result("required-documents", ctx({ app: app({ loanAmountCents: usd(400_000) }), docs: [...full.docs, { id: "fs", type: "financial_statement" as const }] as RuleCtx["docs"], facts: full.facts })).outcome).toBe("pass");
  });
  it("freshness: 120 days passes, 121 fails, none is not applicable", () => {
    const mk = (age: number) => ctx({ docs: [{ id: "fs", type: "financial_statement" }], facts: [f("fs", "financial_statement", "statement_date", d(age))] });
    expect(result("financial-statement-freshness", mk(120)).outcome).toBe("pass");
    expect(result("financial-statement-freshness", mk(121)).outcome).toBe("fail");
    expect(result("financial-statement-freshness", ctx()).outcome).toBe("not_applicable");
    // a statement exists but its date was not accepted: never silently not applicable
    expect(result("financial-statement-freshness", ctx({ docs: [{ id: "fs", type: "financial_statement" }] })).outcome).toBe("needs_review");
  });
  it("DSC: below 1.15 on the new loan alone is a definite fail; above needs review (existing debt unknown)", () => {
    const rich = taxDocs([2025], usd(400_000));
    const poor = taxDocs([2025], usd(10_000));
    const hi = result("debt-service-coverage", ctx({ ...rich }));
    expect(hi.outcome).toBe("needs_review");
    expect(hi.factIds.length).toBe(3);
    expect(result("debt-service-coverage", ctx({ ...poor })).outcome).toBe("fail");
    expect(result("debt-service-coverage", ctx()).outcome).toBe("needs_review"); // no return: cannot compute, never a pass
  });
  it("DSC uses the most recent tax year", () => {
    const a = taxDocs([2024], usd(10_000)), b = taxDocs([2025], usd(400_000));
    const r = result("debt-service-coverage", ctx({ docs: [...a.docs, ...b.docs], facts: [...a.facts, ...b.facts] }));
    expect((r.inputs as { taxYear: number }).taxYear).toBe(2025);
    expect(r.outcome).toBe("needs_review");
  });
  it("maturity: within, mixed-purpose blend needs review, beyond the longest fails", () => {
    expect(result("maturity-limit", ctx({ app: app({ purposes: ["equipment"], requestedTermMonths: 120 }) })).outcome).toBe("pass");
    expect(result("maturity-limit", ctx({ app: app({ purposes: ["equipment"], requestedTermMonths: 121 }) })).outcome).toBe("fail");
    expect(result("maturity-limit", ctx({ app: app({ purposes: ["real_estate", "working_capital"], requestedTermMonths: 200 }) })).outcome).toBe("needs_review");
    expect(result("maturity-limit", ctx({ app: app({ purposes: ["real_estate"], requestedTermMonths: 300 }) })).outcome).toBe("pass");
    expect(result("maturity-limit", ctx({ app: app({ purposes: ["real_estate"], requestedTermMonths: 301 }) })).outcome).toBe("fail");
  });
  it("conditional rules apply only when their trigger is present", () => {
    expect(result("start-up-equity", ctx({ app: app({ yearsInBusiness: 1 }) })).outcome).toBe("needs_review");
    expect(result("start-up-equity", ctx({ app: app({ yearsInBusiness: 2 }) })).outcome).toBe("not_applicable");
    expect(result("refinance-requirements", ctx({ app: app({ purposes: ["refinance"] }) })).outcome).toBe("needs_review");
    expect(result("change-of-ownership", ctx({ app: app({ purposes: ["change_of_ownership"], loanAmountCents: usd(3_000_000) }) })).detail).toMatch(/Quality of Earnings/);
    expect(result("change-of-ownership", ctx({ app: app({ purposes: ["change_of_ownership"], loanAmountCents: usd(500_000) }) })).detail).not.toMatch(/Quality of Earnings/);
    expect(result("working-capital-justification", ctx({ app: app({ purposes: ["working_capital"] }) })).outcome).toBe("needs_review");
  });
  it("a rule that throws fails closed as needs_review", () => {
    const pack: RulePack = { ...SBA_7A_PACK, rules: [{ id: "boom", title: "t", sop: { section: "x", version: "v" }, evaluate: () => { throw new Error("bad"); } }] };
    expect(runPack(pack, ctx())[0]!.outcome).toBe("needs_review");
  });
});
