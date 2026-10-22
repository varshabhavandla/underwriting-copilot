import { randomBytes } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { submitApplication } from "../../src/application/submit";
import { LocalKeyProvider } from "../../src/crypto/fieldCrypto";
import { connect, withTenant, type Sql } from "../../src/db/client";
import { verifyAuditChain } from "../../src/db/repo";
import { buildFile } from "../../src/file/buildFile";
import { ingestDocument } from "../../src/ingest/ingest";
import { DEFAULT_OPTIONS, LlmGateway } from "../../src/llm/gateway";
import { MockProvider, type MockBehavior } from "../../src/llm/mockProvider";
import { makePacket, type Variant } from "../../src/synthetic/generate";
import { createHash } from "node:crypto";
import { addDocument } from "../../src/db/repo";
import { dbEnabled, urls } from "./urls";

const ASOF = new Date("2026-10-21T00:00:00Z");

describe.skipIf(!dbEnabled)("file building: rules, exceptions and a verified memo (real Postgres)", () => {
  let owner: Sql, app: Sql;
  let tenant = "", user = "", other = "";
  const keys = new LocalKeyProvider(randomBytes(32));
  const gw = (b: MockBehavior = "faithful") => new LlmGateway(new MockProvider(b), DEFAULT_OPTIONS);
  const ctx = () => ({ tenantId: tenant, userId: user });

  async function provision(name: string) {
    const [t] = await owner<{ id: string }[]>`select gen_random_uuid() as id`;
    const id = t!.id;
    const u = await withTenant(owner, { tenantId: id }, async (tx) => {
      await tx`insert into tenants (id, name) values (${id}, ${name})`;
      const [r] = await tx<{ id: string }[]>`insert into users (tenant_id, email, role) values (${id}, ${name + "@example.test"}, 'underwriter') returning id`;
      return r!.id;
    });
    return { id, u };
  }
  beforeAll(async () => {
    owner = connect(urls.owner());
    app = connect(urls.app());
    ({ id: tenant, u: user } = await provision("build-a"));
    ({ id: other } = await provision("build-b"));
  });
  afterAll(async () => { await Promise.all([owner.end(), app.end()]); });

  const application = (name: string, o: Record<string, unknown> = {}) => ({
    legalName: name, entityType: "s_corp", ein: "12-3456789", naics: "722511", yearsInBusiness: 6, requestedTermMonths: 120, loanAmount: "$250,000",
    purposes: ["equipment"], owners: [{ name: "A Owner", percent: 100 }], certifyAccurate: true, ...o,
  });

  /** application + documents ingested from a synthetic packet, then the file is built */
  async function prepare(seed: number, variant: Variant, appOverride: Record<string, unknown> = {}, extract: MockBehavior = "faithful") {
    const pk = makePacket(seed, variant, ASOF);
    const sub = await withTenant(app, ctx(), (tx) => submitApplication(tx, keys, tenant, application(pk.legalName + " " + seed, appOverride)));
    const ids: string[] = [];
    await withTenant(app, ctx(), async (tx) => {
      for (const d of pk.docs) ids.push(await addDocument(tx, tenant, { caseId: sub.caseId, docType: d.type, contentSha256: createHash("sha256").update(d.pages.join("\n") + seed + variant).digest("hex"), storageKey: `${tenant}/${sub.caseId}/x${d.id}` }));
    });
    for (const [i, d] of pk.docs.entries()) await ingestDocument(app, gw(extract), ASOF, ctx(), { caseId: sub.caseId, documentId: ids[i]!, docVersion: 1, docType: d.type, pages: d.pages });
    return { caseId: sub.caseId, pk };
  }
  const q = <T extends object>(caseId: string, text: (tx: import("../../src/db/client").Tx) => Promise<T[]>) => withTenant(app, { tenantId: tenant }, text);

  it("regression: different businesses with the same EIN digits and loan amount get different cases; an identical resubmission gets the same one", async () => {
    const a = await withTenant(app, ctx(), (tx) => submitApplication(tx, keys, tenant, application("Alpha Bakery LLC")));
    const b = await withTenant(app, ctx(), (tx) => submitApplication(tx, keys, tenant, application("Beta Bakery LLC")));
    const a2 = await withTenant(app, ctx(), (tx) => submitApplication(tx, keys, tenant, application("Alpha Bakery LLC")));
    expect(a.caseId).not.toBe(b.caseId);
    expect(a2).toMatchObject({ caseId: a.caseId, created: false });
  });

  it("clean file: rules run with SOP citations, memo stored with every line cited, status needs_review (never approved)", async () => {
    const { caseId } = await prepare(201, "clean");
    const r = await buildFile(app, gw(), ctx(), caseId, ASOF);
    expect(r.memoStored).toBe(true);
    expect(r.memoProblems).toEqual([]);
    const results = await q(caseId, (tx) => tx<{ rule_id: string; sop_section: string; outcome: string }[]>`select rule_id, sop_section, outcome from rule_results where case_id = ${caseId}`);
    expect(results.length).toBe(11);
    expect(results.every((x) => x.sop_section.length > 5)).toBe(true);
    const byId = Object.fromEntries(results.map((x) => [x.rule_id, x.outcome]));
    expect(byId).toMatchObject({ "loan-amount-limit": "pass", "ownership-total": "pass", "required-documents": "pass", "financial-statement-freshness": "pass", "maturity-limit": "pass", "start-up-equity": "not_applicable" });
    expect(["needs_review", "fail"]).toContain(byId["debt-service-coverage"]);
    const [memo] = await q(caseId, (tx) => tx<{ sections: { title: string; lines: { text: string; cites: string[] }[] }[] }[]>`select sections from memos where case_id = ${caseId}`);
    expect(memo!.sections.map((s) => s.title)).toEqual(["Business and request", "Financial summary", "Rule results and exceptions", "Open items"]);
    expect(memo!.sections.flatMap((s) => s.lines).every((l) => l.cites.length > 0)).toBe(true);
    expect(JSON.stringify(memo)).not.toMatch(/approv|declin|recommend/i);
    const [c] = await q(caseId, (tx) => tx<{ status: string }[]>`select status from cases where id = ${caseId}`);
    expect(c!.status).toBe("needs_review");
  });

  it("every cited fact id in the memo is a real accepted fact of this case", async () => {
    const { caseId } = await prepare(202, "clean");
    await buildFile(app, gw(), ctx(), caseId, ASOF);
    const [memo] = await q(caseId, (tx) => tx<{ sections: { lines: { cites: string[] }[] }[] }[]>`select sections from memos where case_id = ${caseId} order by created_at desc limit 1`);
    const factIds = memo!.sections.flatMap((s) => s.lines.flatMap((l) => l.cites)).filter((c) => c.startsWith("F:")).map((c) => c.slice(2));
    expect(factIds.length).toBeGreaterThan(0);
    const real = await q(caseId, (tx) => tx<{ id: string }[]>`select id from facts where case_id = ${caseId} and status = 'accepted'`);
    for (const id of factIds) expect(real.map((x) => x.id)).toContain(id);
  });

  it("exceptions are raised for every rule that is not a pass, with the rule id in the kind", async () => {
    const { caseId } = await prepare(203, "clean", { yearsInBusiness: 1, purposes: ["refinance", "working_capital"], requestedTermMonths: 240 });
    const r = await buildFile(app, gw(), ctx(), caseId, ASOF);
    const ex = (await q(caseId, (tx) => tx<{ kind: string; severity: string }[]>`select kind, severity from exceptions where case_id = ${caseId}`)).map((e) => e.kind);
    for (const k of ["rule:start-up-equity", "rule:refinance-requirements", "rule:working-capital-justification", "rule:maturity-limit", "rule:debt-service-coverage"]) expect(ex, k).toContain(k);
    expect(r.exceptionsRaised.length).toBeGreaterThanOrEqual(5);
  });

  it("a definite failure: loan over the maximum fails and raises a high-severity exception", async () => {
    const { caseId } = await prepare(204, "clean", { loanAmount: "$6,000,000" });
    await buildFile(app, gw(), ctx(), caseId, ASOF);
    const ex = await q(caseId, (tx) => tx<{ kind: string; severity: string }[]>`select kind, severity from exceptions where case_id = ${caseId} and kind = 'rule:loan-amount-limit'`);
    expect(ex).toEqual([{ kind: "rule:loan-amount-limit", severity: "high" }]);
  });

  it("upstream exceptions reach the memo as cited open items", async () => {
    const { caseId } = await prepare(205, "bank_arith_error");
    await buildFile(app, gw(), ctx(), caseId, ASOF);
    const [memo] = await q(caseId, (tx) => tx<{ sections: { title: string; lines: { text: string; cites: string[] }[] }[] }[]>`select sections from memos where case_id = ${caseId}`);
    const lines = memo!.sections.find((s) => s.title === "Rule results and exceptions")!.lines;
    expect(lines.some((l) => /bank_arithmetic/.test(l.text) && l.cites.some((c) => c.startsWith("X:")))).toBe(true);
  });

  it.each<[MockBehavior, string]>([["memo_fabricate", "number_not_in_cited_source"], ["memo_decide", "decision_language"], ["memo_miscite", "unknown_citation"]])("a bad memo draft (%s) is never stored and becomes a memo_unverified exception", async (b, kind) => {
    const { caseId } = await prepare(300 + ["memo_fabricate", "memo_decide", "memo_miscite"].indexOf(b), "clean");
    const r = await buildFile(app, gw(b), ctx(), caseId, ASOF);
    expect(r.memoStored).toBe(false);
    expect(r.memoProblems.map((p) => p.kind)).toContain(kind);
    expect(await q(caseId, (tx) => tx`select 1 from memos where case_id = ${caseId}`)).toHaveLength(0);
    expect((await q(caseId, (tx) => tx<{ kind: string }[]>`select kind from exceptions where case_id = ${caseId} and kind = 'memo_unverified'`)).length).toBe(1);
    const [c] = await q(caseId, (tx) => tx<{ status: string }[]>`select status from cases where id = ${caseId}`);
    expect(c!.status).toBe("needs_review"); // still handed to a human
  });

  it("running again appends a new run and does not duplicate exceptions", async () => {
    const { caseId } = await prepare(220, "clean", { yearsInBusiness: 0 });
    await buildFile(app, gw(), ctx(), caseId, ASOF);
    const n1 = (await q(caseId, (tx) => tx`select id from exceptions where case_id = ${caseId}`)).length;
    await buildFile(app, gw(), ctx(), caseId, ASOF);
    expect((await q(caseId, (tx) => tx`select id from exceptions where case_id = ${caseId}`)).length).toBe(n1);
    expect((await q(caseId, (tx) => tx`select id from rule_runs where case_id = ${caseId}`)).length).toBe(2);
  });

  it("results, runs and memos are append-only and tenant scoped (positive control: the owner tenant reads them)", async () => {
    const { caseId } = await prepare(230, "clean");
    await buildFile(app, gw(), ctx(), caseId, ASOF);
    expect((await q(caseId, (tx) => tx`select id from rule_results where case_id = ${caseId}`)).length).toBeGreaterThan(0);
    for (const t of ["rule_results", "rule_runs", "memos"]) {
      await expect(withTenant(app, { tenantId: tenant }, (tx) => tx.unsafe(`update ${t} set created_at = now()`))).rejects.toThrow();
      await expect(withTenant(app, { tenantId: tenant }, (tx) => tx.unsafe(`delete from ${t}`))).rejects.toThrow();
      await expect(admin(t)).rejects.toThrow(/append-only/);
      expect((await withTenant(app, { tenantId: other }, (tx) => tx.unsafe(`select 1 from ${t}`))).length).toBe(0);
    }
  });

  it("the audit ledger records each rule with its pack, version and SOP section, and the chain verifies", async () => {
    const rows = await withTenant(app, { tenantId: tenant }, (tx) => tx<{ rule: { pack: string; version: string; sopSection: string; id: string } }[]>`select rule from audit_events where action = 'rule.evaluated' limit 20`);
    expect(rows.length).toBeGreaterThan(0);
    for (const r of rows) expect(r.rule).toMatchObject({ pack: "sba-7a", version: "SOP 50 10 8.1" });
    expect(await withTenant(app, { tenantId: tenant }, (tx) => verifyAuditChain(tx))).toBeNull();
  });
});

import postgres from "postgres";
async function admin(table: string): Promise<void> {
  const a = postgres(urls.adminOnTestDb(), { onnotice: () => {}, max: 1 });
  try { await a.unsafe(`update ${table} set created_at = now()`); } finally { await a.end(); }
}
