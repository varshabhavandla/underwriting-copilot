import { describe, expect, it } from "vitest";
import { DEFAULT_OPTIONS, LlmGateway } from "../../src/llm/gateway";
import { MockProvider, type MockBehavior } from "../../src/llm/mockProvider";
import { verifyMemo } from "../../src/memo/verify";
import type { MemoDraftT, MemoSource } from "../../src/memo/types";

const sources: MemoSource[] = [
  { id: "A:name", label: "name", text: "Legal business name: Harbor Diner Inc.", renderings: [] },
  { id: "A:loan_amount", label: "amount", text: "Requested loan amount is $250,000.00.", renderings: ["$250,000.00"] },
  { id: "F:1", label: "net", text: "Net income on the 2025 tax return is $210,000.00.", renderings: ["$210,000.00", "2025"] },
  { id: "C:dsc", label: "dsc", text: "Indicative coverage on the new loan alone is 1.520.", renderings: ["1.520"] },
  { id: "R:x", label: "rule", text: "maturity-limit: pass. requested 120 months is within 120 months.", renderings: ["120"] },
  { id: "N:1", label: "gap", text: "Not evaluated by this tool: collateral.", renderings: [] },
];
const req = ["Business and request", "Financial summary", "Rule results and exceptions", "Open items"];
const draft = (lines: Record<string, { text: string; cites: string[] }[]>): MemoDraftT => ({ sections: req.map((title) => ({ title, lines: lines[title] ?? [{ text: "No items.", cites: ["N:1"] }] })) });

describe("memo verification", () => {
  const ok = draft({ "Business and request": [{ text: "Requested loan amount is $250,000.00.", cites: ["A:loan_amount"] }], "Financial summary": [{ text: "Net income on the 2025 tax return is $210,000.00.", cites: ["F:1"] }] });
  it("accepts a draft where every figure matches its cited source", () => expect(verifyMemo(ok, sources)).toEqual([]));
  it("rejects a line with no citation", () => {
    const d = draft({ "Financial summary": [{ text: "The business is doing well.", cites: [] }] });
    expect(verifyMemo(d, sources).map((p) => p.kind)).toContain("no_citation");
  });
  it("rejects an uncited number and an unknown citation", () => {
    expect(verifyMemo(draft({ "Financial summary": [{ text: "Revenue is $5,000,000.00.", cites: [] }] }), sources).map((p) => p.kind)).toContain("uncited_number");
    expect(verifyMemo(draft({ "Financial summary": [{ text: "Net income is high.", cites: ["F:nope"] }] }), sources).map((p) => p.kind)).toContain("unknown_citation");
  });
  it("rejects a figure attached to the wrong citation (control: the right pairing passes)", () => {
    const wrong = draft({ "Financial summary": [{ text: "Net income is $250,000.00.", cites: ["F:1"] }] });
    expect(verifyMemo(wrong, sources).map((p) => p.kind)).toContain("number_not_in_cited_source");
    expect(verifyMemo(draft({ "Financial summary": [{ text: "Net income is $210,000.00.", cites: ["F:1"] }] }), sources)).toEqual([]);
  });
  it("rejects any decision or recommendation language", () => {
    for (const t of ["We recommend approval.", "This loan should be funded.", "The request is declined.", "Denial is likely."]) {
      expect(verifyMemo(draft({ "Open items": [{ text: t, cites: ["N:1"] }] }), sources).map((p) => p.kind), t).toContain("decision_language");
    }
  });
  it("requires all sections", () => {
    const d: MemoDraftT = { sections: [{ title: "Business and request", lines: [{ text: "Not evaluated.", cites: ["N:1"] }] }] };
    expect(verifyMemo(d, sources).filter((p) => p.kind === "missing_section")).toHaveLength(3);
  });
  it("a percentage or date must also match", () => {
    const withPct: MemoSource[] = [...sources, { id: "A:o", label: "o", text: "Ownership 60%", renderings: ["60%"] }];
    expect(verifyMemo(draft({ "Business and request": [{ text: "Owner holds 60%.", cites: ["A:o"] }] }), withPct)).toEqual([]);
    expect(verifyMemo(draft({ "Business and request": [{ text: "Owner holds 70%.", cites: ["A:o"] }] }), withPct).map((p) => p.kind)).toContain("number_not_in_cited_source");
  });
});

describe("gateway memo drafting", () => {
  const gw = (b: MockBehavior, o = {}) => new LlmGateway(new MockProvider(b), { ...DEFAULT_OPTIONS, ...o });
  it("faithful provider: draft verifies and every line carries citations", async () => {
    const r = await gw("faithful").draftMemo("c1", "Harbor Diner Inc", sources);
    expect(r.problems).toEqual([]);
    expect(r.draft).not.toBeNull();
    for (const s of r.draft!.sections) for (const l of s.lines) expect(l.cites.length).toBeGreaterThan(0);
  });
  it.each<[MockBehavior, string]>([["memo_fabricate", "number_not_in_cited_source"], ["memo_decide", "decision_language"], ["memo_miscite", "unknown_citation"]])("%s is rejected (%s) and no draft is returned", async (b, kind) => {
    const r = await gw(b).draftMemo("c1", "X", sources);
    expect(r.draft).toBeNull();
    expect(r.problems.map((p) => p.kind)).toContain(kind);
  });
  it("malformed output and a hung provider are errors, not drafts", async () => {
    expect((await gw("garbage").draftMemo("c1", "X", sources)).call.result).toBe("error");
    expect((await gw("slow", { timeoutMs: 30 }).draftMemo("c1", "X", sources)).call.error).toMatch(/timeout/);
  });
  it("redacts identifiers in the business name before the provider sees them", async () => {
    const p = new MockProvider();
    await new LlmGateway(p, DEFAULT_OPTIONS).draftMemo("c1", "Jane 123-45-6789 LLC", sources);
    expect(JSON.stringify(p.seen)).not.toContain("123-45-6789");
  });
});
