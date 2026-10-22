import type { DocType } from "../extraction/schemas";

export type Outcome = "pass" | "fail" | "needs_review" | "not_applicable";

export interface AcceptedFact {
  id: string;
  docId: string;
  docType: DocType;
  field: string;
  value: string;
  canonicalValue: string;
}

export interface AppView {
  legalName: string;
  entityType: string;
  naics: string;
  yearsInBusiness: number;
  requestedTermMonths: number;
  loanAmountCents: bigint;
  purposes: string[];
  owners: { name: string; percent: number }[];
}

/** Lender policy inputs that are NOT SBA rules. Placeholders until a lender supplies its own. */
export interface LenderOverlay {
  /** Assumed note rate used only for an indicative debt-service estimate. */
  assumedAnnualRatePercent: number;
}

export interface RuleCtx {
  app: AppView;
  facts: AcceptedFact[];
  docs: { id: string; type: DocType }[];
  asOf: Date;
  overlay: LenderOverlay;
}

export interface RuleResult {
  ruleId: string;
  sopSection: string;
  outcome: Outcome;
  detail: string;
  inputs: Record<string, unknown>;
  factIds: string[];
}

export interface Rule {
  id: string;
  title: string;
  /** Every rule must cite the SOP section it implements; a test enforces this. */
  sop: { section: string; version: string };
  applies?: (ctx: RuleCtx) => boolean;
  evaluate(ctx: RuleCtx): { outcome: Outcome; detail: string; inputs?: Record<string, unknown>; factIds?: string[] };
}

export interface RulePack {
  name: string;
  version: string;
  effective: string;
  rules: Rule[];
  /** SOP items this pack does NOT evaluate, with the reason. Reported with every run so coverage is never overstated. */
  notEvaluated: { item: string; sop: string; reason: string }[];
}
