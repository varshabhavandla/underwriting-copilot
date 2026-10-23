import { createHash, randomBytes } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import postgres from "postgres";
import { submitApplication } from "../../src/application/submit";
import { LocalKeyProvider } from "../../src/crypto/fieldCrypto";
import { connect, withTenant, type Sql } from "../../src/db/client";
import { addDocument, recordDecision, verifyAuditChain } from "../../src/db/repo";
import { buildFile } from "../../src/file/buildFile";
import { ingestDocument } from "../../src/ingest/ingest";
import { DEFAULT_OPTIONS, LlmGateway } from "../../src/llm/gateway";
import { MockProvider } from "../../src/llm/mockProvider";
import { ActionDenied, adoptMemo, decideCase, disposeException, reviewFact } from "../../src/review/actions";
import { caseDetail, describeCite, listCases } from "../../src/review/queries";
import { makePacket, type Variant } from "../../src/synthetic/generate";
import { dbEnabled, urls } from "./urls";

const ASOF = new Date("2026-10-21T00:00:00Z");

describe.skipIf(!dbEnabled)("underwriter review: decisions, dispositions, adoption (real Postgres)", () => {
  let owner: Sql, app: Sql, admin: Sql;
  let tenant = "", uw = "", viewer = "", otherTenant = "", otherUw = "";
  const keys = new LocalKeyProvider(randomBytes(32));
  const gw = () => new LlmGateway(new MockProvider("faithful"), DEFAULT_OPTIONS);
  const as = (userId: string, tenantId = tenant) => ({ tenantId, userId });

  async function provision(name: string) {
    const [t] = await owner<{ id: string }[]>`select gen_random_uuid() as id`;
    const id = t!.id;
    const ids = await withTenant(owner, { tenantId: id }, async (tx) => {
      await tx`insert into tenants (id, name) values (${id}, ${name})`;
      const [u] = await tx<{ id: string }[]>`insert into users (tenant_id, email, role) values (${id}, ${name + "-uw@example.test"}, 'underwriter') returning id`;
      const [v] = await tx<{ id: string }[]>`insert into users (tenant_id, email, role) values (${id}, ${name + "-view@example.test"}, 'viewer') returning id`;
      return { uw: u!.id, viewer: v!.id };
    });
    return { id, ...ids };
  }
  beforeAll(async () => {
    owner = connect(urls.owner()); app = connect(urls.app()); admin = postgres(urls.adminOnTestDb(), { onnotice: () => {}, max: 1 });
    const a = await provision("review-a"); ({ id: tenant, uw, viewer } = a);
    const b = await provision("review-b"); ({ id: otherTenant, uw: otherUw } = b);
  });
  afterAll(async () => { await Promise.all([owner.end(), app.end(), admin.end()]); });

  let n = 700;
  async function prepared(variant: Variant = "clean", over: Record<string, unknown> = {}) {
    const seed = n++;
    const pk = makePacket(seed, variant, ASOF);
    const sub = await withTenant(app, as(uw), (tx) => submitApplication(tx, keys, tenant, { legalName: `${pk.legalName} ${seed}`, entityType: "s_corp", ein: "12-3456789", naics: "722511", yearsInBusiness: 6, requestedTermMonths: 120, loanAmount: "$250,000", purposes: ["equipment"], owners: [{ name: "A", percent: 100 }], certifyAccurate: true, ...over }));
    const ids: string[] = [];
    await withTenant(app, as(uw), async (tx) => { for (const d of pk.docs) ids.push(await addDocument(tx, tenant, { caseId: sub.caseId, docType: d.type, contentSha256: createHash("sha256").update(d.pages.join("\n") + seed).digest("hex"), storageKey: `${tenant}/${sub.caseId}/${d.id}` })); });
    for (const [i, d] of pk.docs.entries()) await ingestDocument(app, gw(), ASOF, as(uw), { caseId: sub.caseId, documentId: ids[i]!, docVersion: 1, docType: d.type, pages: d.pages });
    await buildFile(app, gw(), as(uw), sub.caseId, ASOF);
    return sub.caseId;
  }
  const status = async (caseId: string) => (await withTenant(app, as(uw), (tx) => tx<{ status: string }[]>`select status from cases where id = ${caseId}`))[0]!.status;
  const reasons = ["Reviewed the prepared file"];

  it("lists cases with exception counts, and the detail resolves every memo citation to something real", async () => {
    const id = await prepared("bank_arith_error");
    const rows = await withTenant(app, as(uw), (tx) => listCases(tx));
    const row = rows.find((r) => r.id === id)!;
    expect(row).toMatchObject({ status: "needs_review", has_memo: true });
    expect(row.open_high).toBeGreaterThanOrEqual(1);
    const d = (await withTenant(app, as(uw), (tx) => caseDetail(tx, id)))!;
    expect(d.facts.every((f) => f.passage.length > 0 && f.page >= 1)).toBe(true);
    expect(d.rules).toHaveLength(11);
    expect(d.audit.length).toBeGreaterThan(5);
    for (const line of d.memo!.sections.flatMap((s) => s.lines)) for (const c of line.cites) expect(describeCite(c, d), c).not.toMatch(/not found/);
  });

  it("approving with an open high exception needs a recorded override; with one it succeeds; the decision is audited", async () => {
    const id = await prepared("bank_arith_error");
    await expect(decideCase(app, as(uw), { caseId: id, decision: "approve", reasons })).rejects.toThrow(/requires at least one recorded override/);
    expect(await status(id)).toBe("needs_review");
    const r = await decideCase(app, as(uw), { caseId: id, decision: "approve", reasons, overrides: ["Bank arithmetic difference explained by borrower; statement re-requested"] });
    expect(r.status).toBe("approved");
    const [dec] = await withTenant(app, as(uw), (tx) => tx<{ overrides: string[]; policy_version: string }[]>`select overrides, policy_version from decisions where case_id = ${id}`);
    expect(dec!.overrides).toHaveLength(1);
    expect(dec!.policy_version).toBe("sba-7a@SOP 50 10 8.1");
    const a = await withTenant(app, as(uw), (tx) => tx`select 1 from audit_events where action = 'decision.recorded' and subject->>'caseId' = ${id}`);
    expect(a).toHaveLength(1);
  });

  it("positive control: a file with only medium exceptions can be approved without an override", async () => {
    const id = await prepared("clean");
    expect((await decideCase(app, as(uw), { caseId: id, decision: "approve", reasons })).status).toBe("approved");
  });

  it("decline and request-more-info move the case to the right status; a reason is always required", async () => {
    const a = await prepared("clean"), b = await prepared("clean");
    await expect(decideCase(app, as(uw), { caseId: a, decision: "decline", reasons: [" ", ""] })).rejects.toThrow(/reason/);
    expect((await decideCase(app, as(uw), { caseId: a, decision: "decline", reasons })).status).toBe("declined");
    expect((await decideCase(app, as(uw), { caseId: b, decision: "request_more_info", reasons })).status).toBe("info_requested");
    expect(await status(b)).toBe("info_requested");
  });

  it("a decided case is final: no second decision and no flipping the status", async () => {
    const id = await prepared("clean");
    await decideCase(app, as(uw), { caseId: id, decision: "approve", reasons });
    await expect(decideCase(app, as(uw), { caseId: id, decision: "decline", reasons })).rejects.toThrow(/final decision/);
    await expect(withTenant(app, as(uw), (tx) => tx`update cases set status = 'declined' where id = ${id}`)).rejects.toThrow(/final|requires a recorded/);
    expect(await status(id)).toBe("approved");
  });

  it("each final-decision guard works on its own: the decisions table refuses a second decision, and the cases table refuses any status change out of a final state", async () => {
    const id = await prepared("clean");
    await decideCase(app, as(uw), { caseId: id, decision: "approve", reasons });
    // decisions guard, without touching the case status
    await expect(withTenant(app, as(uw), (tx) => recordDecision(tx, tenant, { caseId: id, userId: uw, decision: "decline", reasons, policyVersion: "x" }))).rejects.toThrow(/already decided/);
    // cases guard, to a status the decision rule does not cover
    await expect(withTenant(app, as(uw), (tx) => tx`update cases set status = 'needs_review' where id = ${id}`)).rejects.toThrow(/is final/);
    expect(await status(id)).toBe("approved");
  });

  it("a viewer cannot decide, dispose or adopt, and nothing changes (positive control: the underwriter can)", async () => {
    const id = await prepared("bank_arith_error");
    await expect(decideCase(app, as(viewer), { caseId: id, decision: "request_more_info", reasons })).rejects.toThrow(ActionDenied);
    const ex = (await withTenant(app, as(uw), (tx) => tx<{ id: string }[]>`select id from exceptions where case_id = ${id} and severity = 'high' limit 1`))[0]!;
    await expect(disposeException(app, as(viewer), { exceptionId: ex.id, note: "x" })).rejects.toThrow(/not found|not permitted/);
    const memo = (await withTenant(app, as(uw), (tx) => tx<{ id: string }[]>`select id from memos where case_id = ${id}`))[0]!;
    await expect(adoptMemo(app, as(viewer), { memoId: memo.id })).rejects.toThrow(/not permitted/);
    expect(await status(id)).toBe("needs_review");
    expect((await withTenant(app, as(uw), (tx) => tx`select 1 from exceptions where id = ${ex.id} and status = 'open'`)).length).toBe(1);
    await expect(adoptMemo(app, as(uw), { memoId: memo.id })).resolves.toBeUndefined();
  });

  it("another tenant's underwriter cannot decide, dispose or adopt on this case", async () => {
    const id = await prepared("bank_arith_error");
    await expect(decideCase(app, as(otherUw, otherTenant), { caseId: id, decision: "approve", reasons })).rejects.toThrow(/case not found/);
    const ex = (await withTenant(app, as(uw), (tx) => tx<{ id: string }[]>`select id from exceptions where case_id = ${id} limit 1`))[0]!;
    await expect(disposeException(app, as(otherUw, otherTenant), { exceptionId: ex.id, note: "x" })).rejects.toThrow(/not found/);
  });

  it("disposing an exception needs a note, is recorded and audited, cannot be repeated, and unblocks approval without an override", async () => {
    const id = await prepared("bank_arith_error");
    const highs = await withTenant(app, as(uw), (tx) => tx<{ id: string }[]>`select id from exceptions where case_id = ${id} and status = 'open' and severity in ('high','critical')`);
    expect(highs.length).toBeGreaterThan(0);
    await expect(disposeException(app, as(uw), { exceptionId: highs[0]!.id, note: "  " })).rejects.toThrow(/note is required/);
    for (const h of highs) await disposeException(app, as(uw), { exceptionId: h.id, note: "Borrower supplied corrected statement" });
    await expect(disposeException(app, as(uw), { exceptionId: highs[0]!.id, note: "again" })).rejects.toThrow(/already disposed/);
    const audit = await withTenant(app, as(uw), (tx) => tx`select 1 from audit_events where action = 'exception.disposed' and subject->>'caseId' = ${id}`);
    expect(audit).toHaveLength(highs.length);
    expect((await decideCase(app, as(uw), { caseId: id, decision: "approve", reasons })).status).toBe("approved");
  });

  it("an exception's content cannot be edited, even by the owner role (only the disposition may change)", async () => {
    const id = await prepared("bank_arith_error");
    const ex = (await withTenant(app, as(uw), (tx) => tx<{ id: string }[]>`select id from exceptions where case_id = ${id} limit 1`))[0]!;
    await expect(withTenant(app, as(uw), (tx) => tx`update exceptions set detail = 'edited' where id = ${ex.id}`)).rejects.toThrow();
    await expect(admin`update exceptions set detail = 'edited' where id = ${ex.id}`).rejects.toThrow(/only the disposition may change/);
    await expect(withTenant(app, as(uw), (tx) => tx`delete from exceptions where id = ${ex.id}`)).rejects.toThrow();
  });

  it("memo adoption is once-only, audited, and append-only", async () => {
    const id = await prepared("clean");
    const memo = (await withTenant(app, as(uw), (tx) => tx<{ id: string }[]>`select id from memos where case_id = ${id}`))[0]!;
    await adoptMemo(app, as(uw), { memoId: memo.id });
    await expect(adoptMemo(app, as(uw), { memoId: memo.id })).rejects.toThrow(/already adopted/);
    expect((await withTenant(app, as(uw), (tx) => tx`select 1 from audit_events where action = 'memo.adopted' and subject->>'caseId' = ${id}`)).length).toBe(1);
    await expect(admin`delete from memo_adoptions`).rejects.toThrow(/append-only/);
    expect((await withTenant(app, as(uw), (tx) => caseDetail(tx, id)))!.memo!.adopted).toBe(true);
  });

  it("an underwriter confirms a held fact (audited) and rejects another with a note; a decided fact cannot be reviewed again; another lender cannot see it", async () => {
    const id = await prepared("bank_arith_error"); // the bank facts are held as proposed
    const held = await withTenant(app, as(uw), (tx) => tx<{ id: string; key: string }[]>`select id, key from facts where case_id = ${id} and status = 'proposed' order by key`);
    expect(held.length).toBeGreaterThanOrEqual(2);
    const [a, b] = [held[0]!, held[1]!];
    const r = await reviewFact(app, as(uw), { factId: a.id, verdict: "confirm" });
    expect(r).toEqual({ key: a.key, caseId: id });
    expect((await withTenant(app, as(uw), (tx) => tx<{ status: string }[]>`select status from facts where id = ${a.id}`))[0]!.status).toBe("accepted");
    expect((await withTenant(app, as(uw), (tx) => tx`select 1 from audit_events where action = 'fact.confirmed' and subject->>'factId' = ${a.id} and actor_id = ${uw}`)).length).toBe(1);
    await expect(reviewFact(app, as(uw), { factId: b.id, verdict: "reject" })).rejects.toThrow(/note is required/);
    await reviewFact(app, as(uw), { factId: b.id, verdict: "reject", note: "does not match the original statement" });
    expect((await withTenant(app, as(uw), (tx) => tx<{ status: string }[]>`select status from facts where id = ${b.id}`))[0]!.status).toBe("rejected");
    await expect(reviewFact(app, as(uw), { factId: a.id, verdict: "reject", note: "changed my mind" })).rejects.toThrow(/not found or already reviewed/);
    await expect(reviewFact(app, as(otherUw, otherTenant), { factId: b.id, verdict: "confirm" })).rejects.toThrow(/not found or already reviewed/); // control: same answer as a missing fact
    await expect(reviewFact(app, { tenantId: tenant }, { factId: b.id, verdict: "confirm" })).rejects.toThrow(/not signed in/);
  });

  it("the audit chain still verifies after all of this", async () => {
    expect(await withTenant(app, as(uw), (tx) => verifyAuditChain(tx))).toBeNull();
  });
});
