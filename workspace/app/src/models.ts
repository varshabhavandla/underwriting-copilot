export interface Citation {
  docId: string;
  docVersion: number;
  page: number;
  passage: string;
}

export interface Fact {
  key: string;
  value: string;
  citation: Citation;
}

export interface Conflict {
  key: string;
  facts: Fact[];
  status: "open" | "resolved";
}

export type RuleOutcome = "pass" | "fail" | "needs_review";

export interface RuleResult {
  ruleId: string;
  outcome: RuleOutcome;
  inputs: Record<string, unknown>;
  detail: string;
}

export interface ChecklistResult {
  policyVersion: string;
  results: RuleResult[];
  passed: boolean;
}

export interface PacketDocument {
  id: string;
  type: string;
  version: number;
  pages: string[];
}

export interface Packet {
  caseRef: string;
  documents: PacketDocument[];
  facts: Fact[];
}

export interface InjectionFlag {
  docId: string;
  page: number;
}

export interface CaseReport {
  caseRef: string;
  missingDocuments: string[];
  conflicts: Conflict[];
  injectionFlags: InjectionFlag[];
  checklist: ChecklistResult;
  /** The pipeline never auto-decides; only an underwriter records a decision. */
  status: "needs_review";
}
