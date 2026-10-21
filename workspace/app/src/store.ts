import { createHash } from "node:crypto";

/**
 * In-memory reference for the access and integrity rules in docs/access-model.md.
 * The real database must enforce the same rules (forced row-level security, no
 * bypass role, append-only decisions); these tests define the contract.
 */
const ROLES_THAT_CAN_DECIDE = new Set(["underwriter"]);

export class AccessDenied extends Error {
  constructor(message: string) {
    super(message);
    this.name = "AccessDenied";
  }
}

export function idempotencyKey(orgId: string, caseRef: string, docHashes: string[]): string {
  const raw = [orgId, caseRef, ...[...docHashes].sort()].join("|");
  return createHash("sha256").update(raw).digest("hex");
}

export interface DecisionInput {
  reviewer: string;
  role: string;
  decision: "approve" | "decline" | "request_more_info";
  reasons: string[];
  policyVersion: string;
  overrides?: string[];
}

export interface Decision extends Omit<DecisionInput, "role" | "overrides"> {
  overrides: string[];
}

interface CaseRecord {
  orgId: string;
  caseRef: string;
  decisions: Decision[];
}

export class CaseStore {
  private cases = new Map<string, CaseRecord>();
  private byKey = new Map<string, string>();

  createCase(orgId: string, caseRef: string, docHashes: string[]): string {
    const key = idempotencyKey(orgId, caseRef, docHashes);
    const existing = this.byKey.get(key);
    if (existing) return existing; // retried job: return the existing case
    const caseId = `case_${this.cases.size + 1}`;
    this.cases.set(caseId, { orgId, caseRef, decisions: [] });
    this.byKey.set(key, caseId);
    return caseId;
  }

  getCase(orgId: string, caseId: string): Readonly<CaseRecord> {
    const record = this.cases.get(caseId);
    if (!record || record.orgId !== orgId) {
      // same error for foreign and missing cases: do not leak existence
      throw new AccessDenied("case not found");
    }
    return record;
  }

  recordDecision(orgId: string, caseId: string, input: DecisionInput): void {
    const record = this.getCase(orgId, caseId) as CaseRecord;
    if (!ROLES_THAT_CAN_DECIDE.has(input.role)) {
      throw new AccessDenied("role cannot record decisions");
    }
    if (input.reasons.length === 0) {
      throw new Error("a decision needs at least one reason");
    }
    record.decisions.push({
      reviewer: input.reviewer,
      decision: input.decision,
      reasons: [...input.reasons],
      policyVersion: input.policyVersion,
      overrides: [...(input.overrides ?? [])],
    }); // append-only: never edited or removed
  }
}
