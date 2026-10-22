import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { connect, withTenant, type Sql } from "../../src/db/client";
import { verifyAuditChain } from "../../src/db/repo";
import { ingestDocument } from "../../src/ingest/ingest";
import { ingestPacket } from "../../src/ingest/packet";
import { LlmGateway, DEFAULT_OPTIONS } from "../../src/llm/gateway";
import { MockProvider, type MockBehavior } from "../../src/llm/mockProvider";
import { makePacket, type Variant } from "../../src/synthetic/generate";
import { dbEnabled, urls } from "./urls";

const ASOF = new Date("2026-10-21T00:00:00Z");
const FACTS = 3 * 6 + 5 * 2 + 6; // three tax returns, two bank statements, one financial statement

describe.skipIf(!dbEnabled)("document ingestion on real Postgres", () => {
  let owner: Sql, app: Sql;
  let tenant = "", user = "", otherTenant = "";
  const gw = (b: MockBehavior = "faithful") => new LlmGateway(new MockProvider(b), DEFAULT_OPTIONS);

  async function provision(name: string) {
    const [t] = await owner<{ id: string }[]>`select gen_random_uuid() as id`;
    const id = t!.id;
    const uw = await withTenant(owner, { tenantId: id }, async (tx) => {
      await tx`insert into tenants (id, name) values (${id}, ${name})`;
      const [u] = await tx<{ id: string }[]>`insert into users (tenant_id, email, role) values (${id}, ${name + "@example.test"}, 'underwriter') returning id`;
      return u!.id;
    });
    return { id, uw };
  }
  beforeAll(async () => {
    owner = connect(urls.owner());
    app = connect(urls.app());
    ({ id: tenant, uw: user } = await provision("ingest-a"));
    ({ id: otherTenant } = await provision("ingest-b"));
  });
  afterAll(async () => { await Promise.all([owner.end(), app.end()]); });

  const run = (seed: number, variant: Variant, b: MockBehavior = "faithful") =>
    ingestPacket(app, gw(b), ASOF, { tenantId: tenant, userId: user }, makePacket(seed, variant));
  const facts = (caseId: string) => withTenant(app, { tenantId: tenant }, (tx) => tx<{ key: string; status: string; evidence_score: string; page: number; passage: string }[]>`select key, status, evidence_score, page, passage from facts where case_id = ${caseId} order by key`);
  const excs = (caseId: string) => withTenant(app, { tenantId: tenant }, (tx) => tx<{ kind: string; severity: string }[]>`select kind, severity from exceptions where case_id = ${caseId} order by kind`);

  it("clean packet: every fact is cited, scored 1 and auto-accepted, with no exceptions", async () => {
    const r = await run(101, "clean");
    const f = await facts(r.caseId);
    expect(f).toHaveLength(FACTS);
    expect(f.every((x) => x.status === "accepted" && Number(x.evidence_score) === 1 && x.page === 1 && x.passage.length > 0)).toBe(true);
    expect(await excs(r.caseId)).toEqual([]);
  });

  it("bank arithmetic error: exception raised and the bank facts are NOT auto-accepted", async () => {
    const r = await run(102, "bank_arith_error");
    expect((await excs(r.caseId)).map((e) => e.kind)).toEqual(["bank_arithmetic"]);
    const f = await facts(r.caseId);
    const bank1 = f.filter((x) => x.key.startsWith("bank_statement.") && x.status === "proposed");
    expect(bank1.length).toBe(4);
    expect(f.filter((x) => x.key.startsWith("tax_return.")).every((x) => x.status === "accepted")).toBe(true); // control: unrelated facts still accepted
  });

  it("balance imbalance, stale statement, income mismatch: each planted defect becomes its exception", async () => {
    expect((await excs((await run(103, "balance_imbalance")).caseId)).map((e) => e.kind)).toEqual(["balance_sheet_imbalance"]);
    expect((await excs((await run(104, "stale_statement")).caseId)).map((e) => e.kind)).toEqual(["stale_document"]);
    expect((await excs((await run(105, "income_mismatch")).caseId)).map((e) => e.kind)).toEqual(["income_mismatch"]);
  });

  it("injection: critical exception, facts from the flagged document are proposed only, even from a faithful provider", async () => {
    const r = await run(106, "injection");
    expect((await excs(r.caseId)).map((e) => `${e.kind}:${e.severity}`)).toEqual(["injection_suspected:critical"]);
    const f = await facts(r.caseId);
    expect(f.filter((x) => x.key.startsWith("financial_statement.")).every((x) => x.status === "proposed")).toBe(true);
    expect(f.filter((x) => x.key.startsWith("tax_return.")).every((x) => x.status === "accepted")).toBe(true);
  });

  it("injection against a provider that obeys it: the fabricated fields never become facts", async () => {
    const r = await run(107, "injection", "follow_injections");
    const f = await facts(r.caseId);
    expect(f.some((x) => x.key.includes("approve_loan"))).toBe(false);
    const kinds = (await excs(r.caseId)).map((e) => e.kind);
    expect(kinds).toContain("injection_suspected");
    expect(kinds).toContain("unverifiable_extraction");
    // the fs net income stays a proposal (flagged document), so the injected 9,999,999 cannot be treated as accepted
    expect(f.filter((x) => x.key === "financial_statement.net_income").every((x) => x.status === "proposed")).toBe(true);
  });

  it("hallucinated values are rejected into exceptions and never stored", async () => {
    const r = await run(108, "clean", "hallucinate");
    expect((await excs(r.caseId)).map((e) => e.kind)).toContain("unverifiable_extraction");
    expect((await facts(r.caseId)).some((x) => x.passage.includes("999999999"))).toBe(false);
  });

  it("a failing provider produces an exception, not facts", async () => {
    const r = await run(109, "clean", "garbage");
    expect((await facts(r.caseId))).toHaveLength(0);
    expect(new Set((await excs(r.caseId)).map((e) => e.kind))).toEqual(new Set(["extraction_failed"]));
  });

  it("is idempotent: re-ingesting a processed document is skipped and adds nothing", async () => {
    const pk = makePacket(110, "clean");
    const first = await ingestPacket(app, gw(), ASOF, { tenantId: tenant, userId: user }, pk);
    const before = await facts(first.caseId);
    expect(before).toHaveLength(FACTS);
    const d = first.docs[0]!;
    const again = await ingestDocument(app, gw(), ASOF, { tenantId: tenant, userId: user }, { caseId: first.caseId, documentId: d.documentId, docVersion: 1, docType: pk.docs[0]!.type, pages: pk.docs[0]!.pages });
    expect(again.skipped).toBe(true);
    expect(await facts(first.caseId)).toHaveLength(FACTS);
  });

  it("another tenant sees none of it (positive control: the owner tenant does)", async () => {
    const r = await run(111, "clean");
    expect((await facts(r.caseId)).length).toBe(FACTS);
    const other = await withTenant(app, { tenantId: otherTenant }, (tx) => tx`select id from facts where case_id = ${r.caseId}`);
    expect(other).toHaveLength(0);
  });

  it("the audit ledger records model calls with hashes only, and the chain verifies", async () => {
    const rows = await withTenant(app, { tenantId: tenant }, (tx) => tx<{ llm: Record<string, unknown> }[]>`select llm from audit_events where action = 'llm.call' limit 5`);
    expect(rows.length).toBeGreaterThan(0);
    for (const r of rows) {
      expect(Object.keys(r.llm).sort()).toEqual(["inputHash", "model", "modelConfidence", "outputHash", "promptVersion", "provider", "redactedItems", "tokensEstimate"]);
      expect(JSON.stringify(r.llm)).not.toMatch(/12-3456789|123-45-6789|owner@example/);
    }
    expect(await withTenant(app, { tenantId: tenant }, (tx) => verifyAuditChain(tx))).toBeNull();
  });
});
