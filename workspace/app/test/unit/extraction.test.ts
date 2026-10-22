import { describe, expect, it } from "vitest";
import { canonical } from "../../src/extraction/normalize";
import { validate, type FactView } from "../../src/extraction/validators";
import { LlmGateway, DEFAULT_OPTIONS } from "../../src/llm/gateway";
import { MockProvider } from "../../src/llm/mockProvider";
import { Redactor } from "../../src/llm/redact";
import { BudgetExceeded } from "../../src/llm/types";
import { makePacket } from "../../src/synthetic/generate";

const ASOF = new Date("2026-10-21T00:00:00Z");
const doc = (p: ReturnType<typeof makePacket>, id: string) => p.docs.find((d) => d.id === id)!;

describe("redaction", () => {
  const text = "EIN 12-3456789 owner@example.test 555-123-4567 SSN 123-45-6789 Account number: 000123456789 Net income: $210,000.00 as of 2026-09-30";
  it("removes identifiers and keeps money and dates", () => {
    const r = new Redactor();
    const out = r.redact(text);
    for (const raw of ["12-3456789", "owner@example.test", "555-123-4567", "123-45-6789", "000123456789"]) expect(out).not.toContain(raw);
    expect(out).toContain("$210,000.00");
    expect(out).toContain("2026-09-30");
  });
  it("restores tokens exactly and reuses a token for the same value", () => {
    const r = new Redactor();
    const out = r.redact("SSN 123-45-6789 and again 123-45-6789");
    expect(out.match(/\[\[SSN_1\]\]/g)).toHaveLength(2);
    expect(r.restore(out)).toBe("SSN 123-45-6789 and again 123-45-6789");
  });
});

describe("normalization", () => {
  it("canonicalizes money, ints and dates, and rejects junk", () => {
    expect(canonical("money", "$1,234.50")).toBe("123450");
    expect(canonical("money", "(500.00)")).toBe("-50000");
    expect(canonical("money", "12abc")).toBeNull();
    expect(canonical("date", "2026-02-30")).toBeNull();
    expect(canonical("date", "2026-02-28")).toBe("2026-02-28");
    expect(canonical("int", "2025")).toBe("2025");
  });
});

describe("synthetic generator", () => {
  it("is deterministic and carries ground truth for every printed field", () => {
    const a = makePacket(7, "clean"), b = makePacket(7, "clean");
    expect(a).toEqual(b);
    expect(a.truth.length).toBe(6 + 5 * 2 + 6);
    expect(makePacket(8, "clean").docs[0]!.pages[0]).not.toBe(a.docs[0]!.pages[0]);
  });
});

describe("gateway", () => {
  const gw = (p: MockProvider, o = {}) => new LlmGateway(p, { ...DEFAULT_OPTIONS, ...o });
  const fs = (v: Parameters<typeof makePacket>[1] = "clean") => doc(makePacket(3, v), "d_fs");

  it("extracts verified fields with citations from a faithful provider", async () => {
    const out = await gw(new MockProvider()).extractFacts("c1", "financial_statement", fs().pages);
    expect(out.rejected).toEqual([]);
    expect(out.verified.map((f) => f.field).sort()).toEqual(["net_income", "revenue", "statement_date", "total_assets", "total_equity", "total_liabilities"]);
    expect(out.verified.every((f) => f.passage.length > 0 && f.page === 1)).toBe(true);
  });
  it("never sends raw identifiers to the provider", async () => {
    const p = new MockProvider();
    const tax = doc(makePacket(3, "pii_heavy"), "d_tax");
    await gw(p).extractFacts("c1", "tax_return", tax.pages);
    const sent = JSON.stringify(p.seen);
    for (const raw of ["12-3456789", "owner@example.test", "555-123-4567"]) expect(sent).not.toContain(raw);
    const bank = doc(makePacket(3, "pii_heavy"), "d_bank1");
    const p2 = new MockProvider();
    await gw(p2).extractFacts("c2", "bank_statement", bank.pages);
    const sent2 = JSON.stringify(p2.seen);
    for (const raw of ["123-45-6789", "000123456789", "021000021"]) expect(sent2).not.toContain(raw);
    expect(sent2).toContain("[[SSN_1]]");
  });
  it("rejects a hallucinated value (not in the cited passage)", async () => {
    const out = await gw(new MockProvider("hallucinate")).extractFacts("c1", "financial_statement", fs().pages);
    expect(out.rejected.some((r) => r.reason === "value_not_in_passage")).toBe(true);
    expect(out.verified.length).toBe(5);
  });
  it("rejects fields outside the allowlist and passages that are not in the document", async () => {
    const inj = fs("injection");
    const out = await gw(new MockProvider("follow_injections")).extractFacts("c1", "financial_statement", inj.pages);
    expect(out.rejected.map((r) => r.field)).toContain("approve_loan");
    expect(out.rejected.find((r) => r.field === "approve_loan")!.reason).toBe("field_not_allowed");
  });
  it("treats malformed output and a hung provider as errors, not facts", async () => {
    const bad = await gw(new MockProvider("garbage")).extractFacts("c1", "financial_statement", fs().pages);
    expect(bad.call.result).toBe("error");
    expect(bad.verified).toEqual([]);
    const slow = await gw(new MockProvider("slow"), { timeoutMs: 30 }).extractFacts("c1", "financial_statement", fs().pages);
    expect(slow.call.result).toBe("error");
    expect(slow.call.error).toMatch(/timeout/);
  });
  it("enforces per-case and size budgets", async () => {
    const g = gw(new MockProvider(), { maxCallsPerCase: 2 });
    await g.extractFacts("c1", "financial_statement", fs().pages);
    await g.extractFacts("c1", "financial_statement", fs().pages);
    await expect(g.extractFacts("c1", "financial_statement", fs().pages)).rejects.toThrow(BudgetExceeded);
    await expect(g.extractFacts("c2", "financial_statement", fs().pages)).resolves.toBeTruthy(); // control: other case unaffected
    await expect(gw(new MockProvider(), { maxInputChars: 10 }).extractFacts("c3", "financial_statement", fs().pages)).rejects.toThrow(/size limit/);
  });
  it("refuses unknown document types", async () => {
    await expect(gw(new MockProvider()).extractFacts("c1", "passport", ["x"])).rejects.toThrow(/not allowed/);
  });
  it("records hashes and the model's own confidence for audit only", async () => {
    const out = await gw(new MockProvider()).extractFacts("c1", "financial_statement", fs().pages);
    expect(out.call.inputHash).toMatch(/^[0-9a-f]{64}$/);
    expect(out.call.outputHash).toMatch(/^[0-9a-f]{64}$/);
    expect(out.call.modelConfidence).toBe(0.99);
  });
});

describe("validators", () => {
  const fv = (docId: string, docType: FactView["docType"], field: string, v: string): FactView => ({ docId, docType, field, canonicalValue: v });
  const bank = (end: string): FactView[] => [fv("b", "bank_statement", "beginning_balance", "100000"), fv("b", "bank_statement", "total_deposits", "50000"), fv("b", "bank_statement", "total_withdrawals", "30000"), fv("b", "bank_statement", "ending_balance", end)];

  it("bank arithmetic: passes when exact, fails by one cent", () => {
    expect(validate(bank("120000"), ASOF)).toEqual([]);
    const i = validate(bank("120001"), ASOF);
    expect(i.map((x) => x.kind)).toEqual(["bank_arithmetic"]);
    expect(i[0]!.blocks).toHaveLength(4);
  });
  it("balance sheet must balance exactly", () => {
    const f = (a: string) => [fv("f", "financial_statement", "total_assets", a), fv("f", "financial_statement", "total_liabilities", "300"), fv("f", "financial_statement", "total_equity", "700")];
    expect(validate(f("1000"), ASOF)).toEqual([]);
    expect(validate(f("1001"), ASOF).map((x) => x.kind)).toEqual(["balance_sheet_imbalance"]);
  });
  it("staleness: 120 days passes, 121 fails", () => {
    const d = (n: number) => new Date(ASOF.getTime() - n * 86_400_000).toISOString().slice(0, 10);
    expect(validate([fv("f", "financial_statement", "statement_date", d(120))], ASOF)).toEqual([]);
    expect(validate([fv("f", "financial_statement", "statement_date", d(121))], ASOF).map((x) => x.kind)).toEqual(["stale_document"]);
  });
  it("income reconciliation: within 5 percent passes, beyond fails", () => {
    const mk = (fs: string) => [fv("f", "financial_statement", "net_income", fs), fv("t", "tax_return", "net_income", "100000")];
    expect(validate(mk("105000"), ASOF)).toEqual([]);
    expect(validate(mk("105001"), ASOF).map((x) => x.kind)).toEqual(["income_mismatch"]);
  });
});
