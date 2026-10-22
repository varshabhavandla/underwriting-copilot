import type { Variant } from "./generate";

/** File classes from docs/MEASUREMENT_PLAN.md. Each is scored separately; there is no blended number. */
export interface FileClass {
  id: string;
  title: string;
  variant: Variant;
  /** application field overrides that create the class */
  app: Record<string, unknown>;
  /** exception kinds we planted and expect to see */
  expects: string[];
  /** exceptions that follow from the planted defect and are not false positives */
  knockOns?: string[];
  /** documents are PDFs/scans (no text layer reader): all should route to manual review */
  unreadable?: boolean;
}

export const FILE_CLASSES: FileClass[] = [
  { id: "clean", title: "Clean file", variant: "clean", app: {}, expects: [] },
  { id: "missing_document", title: "Missing document", variant: "missing_document", app: {}, expects: ["rule:required-documents"] },
  { id: "stale_statement", title: "Stale financial statement", variant: "stale_statement", app: {}, expects: ["stale_document"], knockOns: ["rule:financial-statement-freshness"] },
  { id: "bank_arithmetic", title: "Bank statement does not add up", variant: "bank_arith_error", app: {}, expects: ["bank_arithmetic"] },
  { id: "balance_sheet", title: "Balance sheet does not balance", variant: "balance_imbalance", app: {}, expects: ["balance_sheet_imbalance"] },
  { id: "conflicting_income", title: "Net income conflicts with tax return", variant: "income_mismatch", app: {}, expects: ["income_mismatch"] },
  { id: "refinance", title: "Refinance request", variant: "clean", app: { purposes: ["refinance"] }, expects: ["rule:refinance-requirements"] },
  { id: "change_of_ownership", title: "Change of ownership", variant: "clean", app: { purposes: ["change_of_ownership"], loanAmount: "$3,200,000", requestedTermMonths: 120 }, expects: ["rule:change-of-ownership"] },
  { id: "start_up", title: "Start-up (1 year or less)", variant: "clean", app: { yearsInBusiness: 1 }, expects: ["rule:start-up-equity"] },
  { id: "injection", title: "Document contains injected instructions", variant: "injection", app: {}, expects: ["injection_suspected"], knockOns: ["rule:financial-statement-freshness"] },
  { id: "pii_heavy", title: "Identifier-heavy documents", variant: "pii_heavy", app: {}, expects: [] },
  { id: "scanned", title: "Scanned or image-only documents", variant: "clean", app: {}, expects: ["ocr_required"], knockOns: ["rule:required-documents", "rule:financial-statement-freshness"], unreadable: true },
];

/** Exceptions every file in the class is allowed to carry without counting as a false positive. */
export const BASELINE_EXCEPTIONS = ["rule:debt-service-coverage", "rule:working-capital-justification"];
