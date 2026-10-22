import { createServer, type Server } from "node:http";
import { randomBytes } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import postgres from "postgres";
import { submitApplication } from "../../src/application/submit";
import { LocalKeyProvider } from "../../src/crypto/fieldCrypto";
import { connect, withTenant, type Sql } from "../../src/db/client";
import { verifyAuditChain } from "../../src/db/repo";
import { decideCase } from "../../src/review/actions";
import { deliverOutbox, MAX_ATTEMPTS } from "../../src/servicing/deliver";
import { MockServicingAdapter, type MockMode } from "../../src/servicing/mock";
import { EVENT_ID_HEADER, SIGNATURE_HEADER, verify } from "../../src/servicing/webhook";
import { dbEnabled, urls } from "./urls";

describe.skipIf(!dbEnabled)("outbox, servicing adapter and signed webhooks (real Postgres)", () => {
  let owner: Sql, app: Sql, admin: Sql;
  let tenant = "", uw = "", other = "", otherUw = "";
  const keys = new LocalKeyProvider(randomBytes(32));
  const as = (userId: string, tenantId = tenant) => ({ tenantId, userId });
  let n = 0;

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
    owner = connect(urls.owner()); app = connect(urls.app()); admin = postgres(urls.adminOnTestDb(), { onnotice: () => {}, max: 1 });
    ({ id: tenant, u: uw } = await provision("outbox-a"));
    ({ id: other, u: otherUw } = await provision("outbox-b"));
  });
  afterAll(async () => { await Promise.all([owner.end(), app.end(), admin.end()]); });

  async function decided(decision: "approve" | "decline" | "request_more_info" | null = "approve") {
    const sub = await withTenant(app, as(uw), (tx) => submitApplication(tx, keys, tenant, { legalName: `Outbox Co ${++n}`, entityType: "llc", ein: "12-3456789", naics: "722511", yearsInBusiness: 5, requestedTermMonths: 60, loanAmount: "$100,000", purposes: ["equipment"], owners: [{ name: "A", percent: 100 }], certifyAccurate: true }));
    if (decision) await decideCase(app, as(uw), { caseId: sub.caseId, decision, reasons: ["Reviewed"] });
    return sub.caseId;
  }
  const events = (caseId: string) => withTenant(app, as(uw), (tx) => tx<{ id: string; event_type: string; status: string; attempts: number; external_id: string | null; last_error: string | null }[]>`select id, event_type, status, attempts, external_id, last_error from outbox_events where case_id = ${caseId}`);
  const caseStatus = async (id: string) => (await withTenant(app, as(uw), (tx) => tx<{ status: string }[]>`select status from cases where id = ${id}`))[0]!.status;
  const adapter = (m: MockMode = "ok", failFirst = 2) => new MockServicingAdapter(m, failFirst);
  const plus = (s: number) => new Date(Date.now() + s * 1000);

  describe("events exist only because of a human decision", () => {
    it("each decision queues exactly one matching event; a case with no decision has none", async () => {
      const a = await decided("approve"), d = await decided("decline"), i = await decided("request_more_info"), none = await decided(null);
      expect((await events(a)).map((e) => e.event_type)).toEqual(["case.approved"]);
      expect((await events(d)).map((e) => e.event_type)).toEqual(["case.declined"]);
      expect((await events(i)).map((e) => e.event_type)).toEqual(["case.info_requested"]);
      expect(await events(none)).toEqual([]);
    });
    it("the app role cannot insert an event without a matching decision (positive control: the trigger-created one exists)", async () => {
      const id = await decided("decline");
      const [dec] = await withTenant(app, as(uw), (tx) => tx<{ id: string }[]>`select id from decisions where case_id = ${id}`);
      expect((await events(id)).length).toBe(1);
      await expect(withTenant(app, as(uw), (tx) => tx`insert into outbox_events (tenant_id, case_id, decision_id, event_type, payload, idempotency_key) values (${tenant}, ${id}, ${dec!.id}, 'case.approved', '{}', 'forged-1')`)).rejects.toThrow(/row-level security/);
      const none = await decided(null);
      await expect(withTenant(app, as(uw), (tx) => tx`insert into outbox_events (tenant_id, case_id, decision_id, event_type, payload, idempotency_key) values (${tenant}, ${none}, ${dec!.id}, 'case.declined', '{}', 'forged-2')`)).rejects.toThrow();
    });
    it("payload and identity are immutable, delivered is final, and nothing can be deleted", async () => {
      const id = await decided("approve");
      const [ev] = await events(id);
      await expect(withTenant(app, as(uw), (tx) => tx`update outbox_events set payload = '{}' where id = ${ev!.id}`)).rejects.toThrow();
      await expect(admin`update outbox_events set payload = '{}' where id = ${ev!.id}`).rejects.toThrow(/only delivery state/);
      await deliverOutbox(app, as(uw), { adapter: adapter(), now: plus(1) });
      await expect(admin`update outbox_events set status = 'pending' where id = ${ev!.id}`).rejects.toThrow(/is final/);
      await expect(admin`update outbox_events set attempts = 0 where id = ${ev!.id}`).rejects.toThrow(/cannot decrease|is final/);
      await expect(admin`delete from outbox_events where id = ${ev!.id}`).rejects.toThrow(/append-only/);
      await expect(withTenant(app, as(uw), (tx) => tx`delete from outbox_events`)).rejects.toThrow();
    });
  });

  describe("delivery to the servicing adapter", () => {
    it("boards an approved case once, marks it handed_off, audits it, and a second run does nothing", async () => {
      const id = await decided("approve");
      const a = adapter();
      const r1 = await deliverOutbox(app, as(uw), { adapter: a, now: plus(1) });
      expect(r1.delivered).toBeGreaterThanOrEqual(1);
      const [ev] = await events(id);
      expect(ev).toMatchObject({ status: "delivered", attempts: 1 });
      expect(ev!.external_id).toMatch(/^LN-/);
      expect(await caseStatus(id)).toBe("handed_off");
      const pkg = [...a.boarded.values()].find((b) => b.pkg.caseId === id)!.pkg;
      expect(pkg.borrower.einLast4).toBe("6789");
      expect(JSON.stringify(pkg)).not.toContain("12-3456789"); // full EIN never leaves
      const calls = a.calls;
      await deliverOutbox(app, as(uw), { adapter: a, now: plus(2) });
      expect(a.calls).toBe(calls);
      expect((await withTenant(app, as(uw), (tx) => tx`select 1 from audit_events where action = 'servicing.event_emitted' and subject->>'caseId' = ${id}`)).length).toBe(1);
    });
    it("declines and information requests are delivered without boarding a loan", async () => {
      const d = await decided("decline");
      const a = adapter();
      await deliverOutbox(app, as(uw), { adapter: a, now: plus(1) });
      expect((await events(d))[0]!.status).toBe("delivered");
      expect([...a.boarded.values()].some((b) => b.pkg.caseId === d)).toBe(false);
      expect(await caseStatus(d)).toBe("declined");
    });
    it("retries transient failures with backoff and never creates a second loan", async () => {
      const id = await decided("approve");
      const a = adapter("fail_then_ok", 2);
      const t0 = Date.now();
      const run = (offsetSeconds: number) => deliverOutbox(app, as(uw), { adapter: a, now: new Date(t0 + offsetSeconds * 1000) });
      expect((await run(1)).retried).toBeGreaterThanOrEqual(1);                 // attempt 1 fails, next in 30s
      const early = await run(10);                                              // before the backoff has elapsed
      expect(early.claimed).toBe(0);
      expect((await run(40)).retried).toBeGreaterThanOrEqual(1);                // attempt 2 fails, next in 60s
      expect((await run(120)).delivered).toBeGreaterThanOrEqual(1);             // attempt 3 succeeds
      const [ev] = await events(id);
      expect(ev).toMatchObject({ status: "delivered", attempts: 3 });
      expect([...a.boarded.values()].filter((b) => b.pkg.caseId === id)).toHaveLength(1);
      expect(await caseStatus(id)).toBe("handed_off");
    });
    it("a permanent refusal fails at once, raises an exception for a person, and leaves the case approved", async () => {
      const id = await decided("approve");
      await deliverOutbox(app, as(uw), { adapter: adapter("reject"), now: plus(1) });
      expect((await events(id))[0]).toMatchObject({ status: "failed", attempts: 1 });
      expect(await caseStatus(id)).toBe("approved");
      const ex = await withTenant(app, as(uw), (tx) => tx<{ kind: string; severity: string }[]>`select kind, severity from exceptions where case_id = ${id}`);
      expect(ex).toEqual([{ kind: "delivery_failed", severity: "high" }]);
    });
    it("gives up after the maximum number of transient attempts", async () => {
      const id = await decided("approve");
      const a = adapter("always_transient");
      let t = Date.now();
      for (let i = 0; i < MAX_ATTEMPTS + 2; i++) { t += 4_000_000; await deliverOutbox(app, as(uw), { adapter: a, now: new Date(t) }); }
      const [ev] = await events(id);
      expect(ev).toMatchObject({ status: "failed", attempts: MAX_ATTEMPTS });
    });
    it("a hung servicing system times out and is retried, not lost", async () => {
      const id = await decided("approve");
      await deliverOutbox(app, as(uw), { adapter: adapter("slow"), now: plus(1), timeoutMs: 40 });
      const [ev] = await events(id);
      expect(ev!.status).toBe("pending");
      expect(ev!.last_error).toMatch(/abort/i);
    });
    it("two workers at once never deliver the same event twice (lease)", async () => {
      const id = await decided("approve");
      const a = adapter();
      const now = plus(1);
      await Promise.all([deliverOutbox(app, as(uw), { adapter: a, now }), deliverOutbox(app, as(uw), { adapter: a, now })]);
      expect([...a.boarded.values()].filter((b) => b.pkg.caseId === id)).toHaveLength(1);
      expect(a.calls).toBeLessThanOrEqual(a.boarded.size); // every board call was a distinct event, none duplicated
      expect((await events(id))[0]!.attempts).toBe(1);
    });
    it("another tenant's worker sees none of these events (positive control: the owner tenant's worker claims them)", async () => {
      await decided("approve");
      const rOther = await deliverOutbox(app, as(otherUw, other), { adapter: adapter(), now: plus(1) });
      expect(rOther.claimed).toBe(0);
      expect((await deliverOutbox(app, as(uw), { adapter: adapter(), now: plus(1) })).claimed).toBeGreaterThan(0);
    });
  });

  describe("signed webhooks over HTTP", () => {
    let server: Server, base = "";
    const received: { id: string; verified: boolean; body: string }[] = [];
    let respond: (n: number) => number = () => 200;
    let secretAtServer = "whsec_test";
    beforeAll(async () => {
      server = createServer((req, res) => {
        let body = "";
        req.on("data", (c) => (body += c));
        req.on("end", () => {
          const ok = verify(secretAtServer, body, String(req.headers[SIGNATURE_HEADER] ?? ""), Math.floor(Date.now() / 1000));
          received.push({ id: String(req.headers[EVENT_ID_HEADER]), verified: ok, body });
          res.statusCode = ok ? respond(received.length) : 401;
          res.end("x");
        });
      });
      await new Promise<void>((r) => server.listen(0, "127.0.0.1", r));
      base = `http://127.0.0.1:${(server.address() as { port: number }).port}/hook`;
    });
    afterAll(() => new Promise<void>((r) => server.close(() => r())));
    const target = (url = base, secret = "whsec_test") => ({ url, secret, allowLocal: true });

    it("delivers a signed event; the receiver verifies the signature and gets a stable event id", async () => {
      received.length = 0; respond = () => 200;
      const id = await decided("approve");
      await deliverOutbox(app, as(uw), { adapter: adapter(), webhook: target(), now: plus(1) });
      const [ev] = await events(id);
      const got = received.find((r) => r.id === ev!.id)!;
      expect(got.verified).toBe(true);
      expect(JSON.parse(got.body)).toMatchObject({ id: ev!.id, type: "case.approved", data: { caseId: id } });
      expect(JSON.parse(got.body).data).not.toHaveProperty("reasons"); // free-text reasons are not sent
    });
    it("a subscriber failure (500) is retried with the same event id, then succeeds", async () => {
      received.length = 0; respond = (n) => (n === 1 ? 500 : 200);
      const id = await decided("decline");
      const t0 = Date.now();
      await deliverOutbox(app, as(uw), { adapter: adapter(), webhook: target(), now: new Date(t0 + 1000) });
      expect((await events(id))[0]).toMatchObject({ status: "pending" });
      await deliverOutbox(app, as(uw), { adapter: adapter(), webhook: target(), now: new Date(t0 + 60_000) });
      const [ev] = await events(id);
      expect(ev).toMatchObject({ status: "delivered", attempts: 2 });
      const mine = received.filter((r) => r.id === ev!.id);
      expect(mine).toHaveLength(2);
      expect(mine.every((r) => r.verified)).toBe(true);
    });
    it("a subscriber that rejects the signature (401) is a permanent failure that raises an exception", async () => {
      received.length = 0; respond = () => 200;
      const id = await decided("approve");
      await deliverOutbox(app, as(uw), { adapter: adapter(), webhook: target(base, "wrong-secret"), now: plus(1) });
      expect((await events(id))[0]).toMatchObject({ status: "failed", attempts: 1 });
      expect((await withTenant(app, as(uw), (tx) => tx`select 1 from exceptions where case_id = ${id} and kind = 'delivery_failed'`)).length).toBe(1);
      expect(received.at(-1)!.verified).toBe(false);
      expect(secretAtServer).toBe("whsec_test");
    });
    it("a webhook pointed at a metadata or private address is refused before any request is made", async () => {
      received.length = 0;
      const id = await decided("approve");
      await deliverOutbox(app, as(uw), { adapter: adapter(), webhook: { url: "https://169.254.169.254/latest/meta-data", secret: "x" }, now: plus(1) });
      expect((await events(id))[0]).toMatchObject({ status: "failed" });
      expect((await events(id))[0]!.last_error).toMatch(/non-public|https/);
      expect(received).toHaveLength(0);
    });
  });

  it("the audit chain verifies after all deliveries", async () => {
    expect(await withTenant(app, as(uw), (tx) => verifyAuditChain(tx))).toBeNull();
  });
});
