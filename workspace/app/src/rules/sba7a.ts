import { annualDebtServiceCents, dscMilli, ebitdaCents, fmtMilli, fmtUsd } from "./calc";
import type { AcceptedFact, Rule, RuleCtx, RulePack } from "./types";

const V = "SOP 50 10 8.1";
const cents = (n: number) => BigInt(n) * 100n;
const STANDARD_MAX = cents(5_000_000);
const SMALL_MAX = cents(350_000);
const GUARANTY_CAP = cents(3_750_000);
const STALE_DAYS = 120;
const DSC_MIN_MILLI = 1150n;

const fact = (ctx: RuleCtx, docId: string, field: string): AcceptedFact | undefined => ctx.facts.find((f) => f.docId === docId && f.field === field);
const docsOf = (ctx: RuleCtx, t: string) => ctx.docs.filter((d) => d.type === t);

/** The most recent tax return by tax_year fact, with the facts we need. */
function latestReturn(ctx: RuleCtx): { docId: string; year: number } | undefined {
  const ys = docsOf(ctx, "tax_return").map((d) => ({ docId: d.id, year: Number(fact(ctx, d.id, "tax_year")?.canonicalValue ?? NaN) })).filter((y) => Number.isFinite(y.year));
  return ys.sort((a, b) => b.year - a.year)[0];
}

const maxMonthsFor = (purpose: string): number => (purpose === "real_estate" ? 300 : 120); // App. 17: real estate up to 25 years, others up to 10

export const rules: Rule[] = [
  {
    id: "loan-amount-limit", title: "Loan amount within program maximum",
    sop: { section: "Section B, Chapter 1, Maximum Loan Amount", version: V },
    evaluate: (c) => {
      const a = c.app.loanAmountCents;
      const cls = a <= SMALL_MAX ? "7(a) Small" : "Standard 7(a)";
      if (a > STANDARD_MAX) return { outcome: "fail", detail: `requested ${fmtUsd(a)} exceeds the ${fmtUsd(STANDARD_MAX)} maximum; affiliates are not yet considered`, inputs: { loanAmountCents: a.toString(), class: cls } };
      return { outcome: "pass", detail: `requested ${fmtUsd(a)} is within the maximum and falls under ${cls}; affiliated businesses must be added in by the underwriter`, inputs: { loanAmountCents: a.toString(), class: cls } };
    },
  },
  {
    id: "guaranty-percentage", title: "Maximum SBA guaranty percentage and amount",
    sop: { section: "Appendix 16, Maximum Guaranty Amounts and Percentages", version: V },
    evaluate: (c) => {
      const a = c.app.loanAmountCents;
      const pct = a <= cents(150_000) ? 85n : 75n;
      const guar = (a * pct) / 100n;
      const over = guar > GUARANTY_CAP;
      return { outcome: over ? "fail" : "pass", detail: `maximum guaranty ${pct}% = ${fmtUsd(guar)}${over ? ` exceeds the ${fmtUsd(GUARANTY_CAP)} per-business cap` : "; existing SBA exposure of the business and affiliates must be added in by the underwriter"}`, inputs: { percent: Number(pct), guaranteedCents: guar.toString() } };
    },
  },
  {
    id: "ownership-total", title: "Listed ownership totals 100 percent",
    sop: { section: "Appendix 20, General Requirements (SBA Loan System ownership)", version: V },
    evaluate: (c) => {
      const t = Math.round(c.app.owners.reduce((s, o) => s + o.percent, 0) * 100) / 100;
      return t === 100 ? { outcome: "pass", detail: "owners total 100 percent", inputs: { total: t } } : { outcome: "fail", detail: `owners total ${t} percent`, inputs: { total: t } };
    },
  },
  {
    id: "required-documents", title: "Required financial documents present",
    sop: { section: "Appendix 20, General Requirements; Section B, Chapter 2, Credit Standards (bank statements)", version: V },
    evaluate: (c) => {
      const missing: string[] = [];
      const years = new Set(docsOf(c, "tax_return").map((d) => fact(c, d.id, "tax_year")?.canonicalValue).filter(Boolean));
      if (years.size < 3) missing.push(`tax returns or statements for 3 years (have ${years.size})`);
      if (docsOf(c, "financial_statement").length < 1) missing.push("interim financial statement");
      if (c.app.loanAmountCents <= SMALL_MAX) {
        const months = new Set(docsOf(c, "bank_statement").map((d) => fact(c, d.id, "period_end")?.canonicalValue?.slice(0, 7)).filter(Boolean));
        if (months.size < 2) missing.push(`two months of operating account bank statements (have ${months.size})`);
      }
      return missing.length ? { outcome: "fail", detail: "missing: " + missing.join("; "), inputs: { missing } } : { outcome: "pass", detail: "required financial documents are present", inputs: {} };
    },
  },
  {
    id: "financial-statement-freshness", title: "Business financial statements dated within 120 days",
    sop: { section: "Appendix 20, General Requirements", version: V },
    evaluate: (c) => {
      const ds = docsOf(c, "financial_statement").map((d) => fact(c, d.id, "statement_date")).filter((f): f is AcceptedFact => !!f);
      if (ds.length === 0) {
        return docsOf(c, "financial_statement").length > 0
          ? { outcome: "needs_review", detail: "a financial statement was received but its date was not accepted (see the exceptions raised at ingestion)", inputs: {} }
          : { outcome: "not_applicable", detail: "no financial statement received (see required documents)", inputs: {} };
      }
      const newest = ds.sort((a, b) => (a.canonicalValue < b.canonicalValue ? 1 : -1))[0]!;
      const age = Math.floor((c.asOf.getTime() - Date.parse(newest.canonicalValue + "T00:00:00Z")) / 86_400_000);
      return { outcome: age > STALE_DAYS ? "fail" : "pass", detail: `newest statement dated ${newest.canonicalValue} is ${age} days old (limit ${STALE_DAYS})`, inputs: { ageDays: age }, factIds: [newest.id] };
    },
  },
  {
    id: "debt-service-coverage", title: "Debt service coverage, new loan only (indicative)",
    sop: { section: "Section B, Chapter 1, Credit Standards (DSC at least 1.15)", version: V },
    evaluate: (c) => {
      const tr = latestReturn(c);
      if (!tr) return { outcome: "needs_review", detail: "no accepted tax return to compute operating cash flow", inputs: {} };
      const ni = fact(c, tr.docId, "net_income"), ie = fact(c, tr.docId, "interest_expense"), dp = fact(c, tr.docId, "depreciation");
      if (!ni || !ie || !dp) return { outcome: "needs_review", detail: `latest return (${tr.year}) lacks an accepted net income, interest or depreciation fact`, inputs: { taxYear: tr.year } };
      const ebitda = ebitdaCents(BigInt(ni.canonicalValue), BigInt(ie.canonicalValue), BigInt(dp.canonicalValue));
      const ds = annualDebtServiceCents(c.app.loanAmountCents, c.overlay.assumedAnnualRatePercent, c.app.requestedTermMonths);
      const dsc = dscMilli(ebitda, ds);
      const inputs = { taxYear: tr.year, ebitdaCents: ebitda.toString(), annualDebtServiceCents: ds.toString(), dscMilli: dsc?.toString() ?? null, assumedRatePercent: c.overlay.assumedAnnualRatePercent, termMonths: c.app.requestedTermMonths };
      const ids = [ni.id, ie.id, dp.id];
      const text = `EBITDA ${fmtUsd(ebitda)} over annual debt service on the new loan ${fmtUsd(ds)} (assumed rate ${c.overlay.assumedAnnualRatePercent}%, ${c.app.requestedTermMonths} months) gives ${dsc === null ? "n/a" : fmtMilli(dsc)}`;
      // Existing debt and owner draws are not known, so this is an upper bound: below the minimum is a definite fail; above needs review.
      if (dsc !== null && dsc < DSC_MIN_MILLI) return { outcome: "fail", detail: `${text}, below 1.150 before any existing debt`, inputs, factIds: ids };
      return { outcome: "needs_review", detail: `${text}; existing debt, owner draws and add-backs are not included, so global coverage must be confirmed`, inputs, factIds: ids };
    },
  },
  {
    id: "maturity-limit", title: "Requested term within maximum maturity for use of proceeds",
    sop: { section: "Appendix 17, 7(a) Loan Maturity Requirements", version: V },
    evaluate: (c) => {
      const limits = c.app.purposes.map(maxMonthsFor);
      const lo = Math.min(...limits), hi = Math.max(...limits), t = c.app.requestedTermMonths;
      const inputs = { requestedMonths: t, lowestLimit: lo, highestLimit: hi };
      if (t > hi) return { outcome: "fail", detail: `requested ${t} months exceeds the longest permitted ${hi} months for these purposes`, inputs };
      if (t > lo) return { outcome: "needs_review", detail: `requested ${t} months exceeds ${lo} months for some purposes; a blended maturity depends on the split of proceeds, which is not collected`, inputs };
      return { outcome: "pass", detail: `requested ${t} months is within ${lo} months`, inputs };
    },
  },
  {
    id: "start-up-equity", title: "Start-up equity injection",
    sop: { section: "Section B, Chapter 1, Credit Standards, Equity requirements", version: V },
    applies: (c) => c.app.yearsInBusiness <= 1,
    evaluate: (c) => ({ outcome: "needs_review", detail: `business operating ${c.app.yearsInBusiness} year(s) is treated as a start-up: at least 10 percent equity injection of total project costs, and projections with DSC of 1.15 within 2 years; project costs and equity sources are not collected`, inputs: { yearsInBusiness: c.app.yearsInBusiness } }),
  },
  {
    id: "refinance-requirements", title: "Debt refinancing conditions",
    sop: { section: "Appendix 14, 7(a) Debt Refinancing Requirements", version: V },
    applies: (c) => c.app.purposes.includes("refinance"),
    evaluate: () => ({ outcome: "needs_review", detail: "refinancing requires a written analysis, notes and statements for each debt, proof the debt has been current, itemized creditors of $10,000 or more, and an installment payment at least 10 percent lower; none of this data is collected yet", inputs: {} }),
  },
  {
    id: "change-of-ownership", title: "Change of ownership due diligence",
    sop: { section: "Appendix 15, 7(a) Changes of Ownership", version: V },
    applies: (c) => c.app.purposes.includes("change_of_ownership"),
    evaluate: (c) => ({ outcome: "needs_review", detail: `change of ownership needs a lender-requested business valuation (the lender may self-value at a purchase price of $350,000 or less unless buyer and seller are closely related), lender verification of the seller's financial data, a site visit${c.app.loanAmountCents >= cents(3_000_000) ? ", and a Quality of Earnings report (loan amount is $3 million or more; purchase price not collected)" : ""}`, inputs: { loanAmountCents: c.app.loanAmountCents.toString() } }),
  },
  {
    id: "working-capital-justification", title: "Working capital share needs credit memo justification",
    sop: { section: "Section B, Chapter 1, Credit Standards (working capital of 50 percent or more)", version: V },
    applies: (c) => c.app.purposes.includes("working_capital"),
    evaluate: (c) => ({ outcome: "needs_review", detail: c.app.purposes.length === 1 ? "all proceeds are working capital: the credit memorandum must explain why this level is necessary" : "share of proceeds for working capital is not collected; if 50 percent or more the credit memorandum must explain why", inputs: { purposes: c.app.purposes } }),
  },
];

export const SBA_7A_PACK: RulePack = {
  name: "sba-7a",
  version: "SOP 50 10 8.1",
  effective: "2026-10-01",
  rules,
  notEvaluated: [
    { item: "Eligibility: size standard, ineligible business types, affiliation, prior government loss, citizenship", sop: "Section A, Chapter 1", reason: "not collected; SBA also makes the eligibility determination from submitted data" },
    { item: "IRS tax transcripts (Form 4506-C / 8821) and reconciliation", sop: "Section A, Chapter 5, Para. B", reason: "transcripts are not ingested" },
    { item: "Owner personal financial statements (Form 413) and credit reports", sop: "Appendix 20", reason: "document types not supported yet" },
    { item: "Collateral, appraisals, lien position, fully-secured test", sop: "Appendix 19", reason: "collateral data not collected" },
    { item: "Existing business debt schedule and global cash flow", sop: "Section B, Chapter 1, Credit Standards", reason: "debt schedule not collected; DSC above is new-loan-only" },
    { item: "Franchise, management agreement, insurance, credit elsewhere", sop: "Section A and Section B, Chapter 1", reason: "not collected" },
    { item: "Interest rate cap check", sop: "Appendix 18", reason: "needs the current base rate, not verified here" },
  ],
};
