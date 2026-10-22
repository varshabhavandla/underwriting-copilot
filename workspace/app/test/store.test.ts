import { beforeEach, describe, expect, it } from "vitest";
import { AccessDenied, CaseStore } from "../src/store";

let store: CaseStore;
let caseId: string;
beforeEach(() => {
  store = new CaseStore();
  caseId = store.createCase("orgA", "SYN-1", ["h1", "h2"]);
});

const decide = (role: string, reasons: string[]) =>
  store.recordDecision("orgA", caseId, {
    reviewer: "amy",
    role,
    decision: "approve",
    reasons,
    policyVersion: "v1",
    overrides: ["waived x"],
  });

describe("case store", () => {
  it("does not duplicate a case on retry", () => expect(store.createCase("orgA", "SYN-1", ["h2", "h1"])).toBe(caseId));
  it("blocks other orgs", () => expect(() => store.getCase("orgB", caseId)).toThrow(AccessDenied));
  it("gives foreign and missing cases the same error", () => {
    const msg = (fn: () => unknown) => {
      try {
        fn();
      } catch (e) {
        return (e as Error).message;
      }
      return "no error";
    };
    expect(msg(() => store.getCase("orgB", caseId))).toBe(msg(() => store.getCase("orgB", "nope")));
  });
  it("only an underwriter decides", () => expect(() => decide("viewer", ["ok"])).toThrow(AccessDenied));
  it("requires a reason", () => expect(() => decide("underwriter", [])).toThrow(/reason/));
  it("records policy version and overrides, append-only", () => {
    decide("underwriter", ["docs complete"]);
    decide("underwriter", ["second look"]);
    const d = store.getCase("orgA", caseId).decisions;
    expect(d).toHaveLength(2);
    expect(d[0]).toMatchObject({ policyVersion: "v1", overrides: ["waived x"] });
  });
});
