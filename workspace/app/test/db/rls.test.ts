import { afterAll, beforeAll, describe, expect, it } from "vitest";
import postgres from "postgres";
import { connect, withTenant, type Sql } from "../../src/db/client";
import { addDocument, appendAudit, createCase, proposeFact, recordDecision, setCaseStatus, verifyAuditChain } from "../../src/db/repo";
import { dbEnabled, urls } from "./urls";

const SHA = "a".repeat(64);
const SHA2 = "b".repeat(64);

describe.skipIf(!dbEnabled)("tenant isolation, integrity and audit (real Postgres)", () => {
  let owner: Sql, app: Sql, admin: Sql;
  let tA = "", tB = "", uwA = "", viewA = "", uwB = "";

  async function provision(name: string): Promise<{ tenant: string; underwriter: string; viewer: string }> {
    const [t] = await owner<{ id: string }[]>`select gen_random_uuid() as id`;
    const tenant = t!.id;
    const ids = await withTenant(owner, { tenantId: tenant }, async (tx) => {
      await tx`insert into tenants (id, name) values (${tenant}, ${name})`;
      const [u] = await tx<{ id: string }[]>`insert into users (tenant_id, email, role) values (${tenant}, ${name + "-uw@example.test"}, 'underwriter') returning id`;
      const [v] = await tx<{ id: string }[]>`insert into users (tenant_id, email, role) values (${tenant}, ${name + "-view@example.test"}, 'viewer') returning id`;
      return { underwriter: u!.id, viewer: v!.id };
    });
    return { tenant, ...ids };
  }

  beforeAll(async () => {
    owner = connect(urls.owner());
    app = connect(urls.app());
    admin = connect(urls.adminOnTestDb());
    const a = await provision("tenant-a");
    const b = await provision("tenant-b");
    ({ tenant: tA, underwriter: uwA, viewer: viewA } = a);
    ({ tenant: tB, underwriter: uwB } = b);
  });
  afterAll(async () => {
    await Promise.all([owner.end(), app.end(), admin.end()]);
  });

  describe("policy as code", () => {
    it("every table has RLS enabled and FORCED", async () => {
      const rows = await admin<{ relname: string; relrowsecurity: boolean; relforcerowsecurity: boolean }[]>`
        select c.relname, c.relrowsecurity, c.relforcerowsecurity from pg_class c join pg_namespace n on n.oid = c.relnamespace
        where n.nspname = 'public' and c.relkind = 'r' and c.relname <> 'schema_migrations'`;
      expect(rows.length).toBeGreaterThanOrEqual(7);
      for (const r of rows) {
        expect(r.relrowsecurity, `${r.relname} RLS`).toBe(true);
        expect(r.relforcerowsecurity, `${r.relname} FORCE`).toBe(true);
      }
    });
    it("every table except tenants carries tenant_id", async () => {
      const rows = await admin<{ relname: string }[]>`
        select c.relname from pg_class c join pg_namespace n on n.oid = c.relnamespace
        where n.nspname = 'public' and c.relkind = 'r' and c.relname not in ('schema_migrations', 'tenants')
          and not exists (select 1 from pg_attribute a where a.attrelid = c.oid and a.attname = 'tenant_id' and not a.attisdropped)`;
      expect(rows).toEqual([]);
    });
    it("the application role is not superuser, has no BYPASSRLS and owns nothing", async () => {
      const [r] = await admin<{ rolsuper: boolean; rolbypassrls: boolean }[]>`select rolsuper, rolbypassrls from pg_roles where rolname = 'uw_app'`;
      expect(r).toEqual({ rolsuper: false, rolbypassrls: false });
      const owned = await admin`select tablename from pg_tables where schemaname = 'public' and tableowner = 'uw_app'`;
      expect(owned).toHaveLength(0);
    });
    it("the migration role has no BYPASSRLS either", async () => {
      const [r] = await admin<{ rolsuper: boolean; rolbypassrls: boolean }[]>`select rolsuper, rolbypassrls from pg_roles where rolname = 'uw_owner'`;
      expect(r).toEqual({ rolsuper: false, rolbypassrls: false });
    });
  });

  describe("isolation (every denial is paired with a positive control)", () => {
    let caseA = "", caseB = "";
    beforeAll(async () => {
      caseA = (await withTenant(app, { tenantId: tA, userId: uwA }, (tx) => createCase(tx, tA, { caseRef: "A-1", docHashes: [SHA] }))).id;
      caseB = (await withTenant(app, { tenantId: tB, userId: uwB }, (tx) => createCase(tx, tB, { caseRef: "B-1", docHashes: [SHA] }))).id;
    });

    it("positive control: a tenant sees its own case", async () => {
      const rows = await withTenant(app, { tenantId: tA }, (tx) => tx`select id from cases`);
      expect(rows.map((r) => r.id)).toEqual([caseA]);
    });
    it("tenant A cannot see tenant B's case, even by id", async () => {
      const rows = await withTenant(app, { tenantId: tA }, (tx) => tx`select id from cases where id = ${caseB}`);
      expect(rows).toHaveLength(0);
    });
    it("no tenant context returns nothing, and a context returns rows (control)", async () => {
      expect(await app`select id from cases`).toHaveLength(0);
      expect((await withTenant(app, { tenantId: tB }, (tx) => tx`select id from cases`)).length).toBe(1);
    });
    it("cannot insert a row into another tenant", async () => {
      await expect(
        withTenant(app, { tenantId: tA }, (tx) => tx`insert into cases (tenant_id, case_ref, idem_key) values (${tB}, 'x', 'k')`),
      ).rejects.toThrow(/row-level security/);
    });
    it("cannot reference another tenant's case from a document", async () => {
      await expect(withTenant(app, { tenantId: tA }, (tx) => addDocument(tx, tA, { caseId: caseB, docType: "t", contentSha256: SHA2, storageKey: "k" }))).rejects.toThrow();
    });
    it("cannot move a row to another tenant by update", async () => {
      await expect(withTenant(app, { tenantId: tA }, (tx) => tx`update cases set tenant_id = ${tB} where id = ${caseA}`)).rejects.toThrow();
    });
    it("tenant context does not leak to the next transaction on the same connection", async () => {
      const single = connect(urls.app());
      const one = postgres(urls.app(), { max: 1, onnotice: () => {} });
      try {
        expect((await withTenant(one, { tenantId: tA }, (tx) => tx`select id from cases`)).length).toBe(1);
        expect(await one`select id from cases`).toHaveLength(0);
      } finally {
        await single.end();
        await one.end();
      }
    });
    it("rejects a malformed tenant id before it reaches SQL", async () => {
      await expect(withTenant(app, { tenantId: "x'; drop table cases;--" }, (tx) => tx`select 1`)).rejects.toThrow(/invalid tenant id/);
    });
    it("the audit ledger is tenant scoped", async () => {
      await withTenant(app, { tenantId: tA }, (tx) => appendAudit(tx, tA, { actorKind: "system", actorId: "t", action: "x.y" }));
      const b = await withTenant(app, { tenantId: tB }, (tx) => tx`select count(*)::int as n from audit_events where action = 'x.y'`);
      expect(b[0]!.n).toBe(0);
    });
  });

  describe("integrity", () => {
    it("is idempotent: the same inputs return the same case", async () => {
      const first = await withTenant(app, { tenantId: tA }, (tx) => createCase(tx, tA, { caseRef: "IDEM", docHashes: [SHA, SHA2] }));
      const again = await withTenant(app, { tenantId: tA }, (tx) => createCase(tx, tA, { caseRef: "IDEM", docHashes: [SHA2, SHA] }));
      expect(again).toEqual({ id: first.id, created: false });
      expect(first.created).toBe(true);
    });
    it("rejects invalid input at the boundary", async () => {
      await expect(withTenant(app, { tenantId: tA }, (tx) => createCase(tx, tA, { caseRef: "", docHashes: [] }))).rejects.toThrow();
      await expect(withTenant(app, { tenantId: tA }, (tx) => createCase(tx, tA, { caseRef: "ok", docHashes: ["nothex"] }))).rejects.toThrow();
    });
    it("a fact cannot exist without a citation", async () => {
      const c = await withTenant(app, { tenantId: tA }, (tx) => createCase(tx, tA, { caseRef: "FACT-1", docHashes: [] }));
      const doc = await withTenant(app, { tenantId: tA }, (tx) => addDocument(tx, tA, { caseId: c.id, docType: "application_form", contentSha256: SHA, storageKey: "k1" }));
      const ok = await withTenant(app, { tenantId: tA }, (tx) => proposeFact(tx, tA, { caseId: c.id, key: "requested_amount", value: "50000", citation: { docId: doc, docVersion: 1, page: 1, passage: "Requested amount: $50,000" } }));
      expect(ok).toBeTruthy();
      await expect(withTenant(app, { tenantId: tA }, (tx) => tx`insert into facts (tenant_id, case_id, key, value, doc_id, doc_version, page, passage) values (${tA}, ${c.id}, 'k', 'v', ${doc}, 1, 1, '')`)).rejects.toThrow();
      await expect(withTenant(app, { tenantId: tA }, (tx) => proposeFact(tx, tA, { caseId: c.id, key: "k", value: "v", citation: { docId: doc, docVersion: 1, page: 0, passage: "p" } }))).rejects.toThrow();
    });
    it("fact status is final once decided and values cannot change", async () => {
      const c = await withTenant(app, { tenantId: tA }, (tx) => createCase(tx, tA, { caseRef: "FACT-2", docHashes: [] }));
      const doc = await withTenant(app, { tenantId: tA }, (tx) => addDocument(tx, tA, { caseId: c.id, docType: "t", contentSha256: SHA2, storageKey: "k2" }));
      const f = await withTenant(app, { tenantId: tA }, (tx) => proposeFact(tx, tA, { caseId: c.id, key: "n", value: "Jane", citation: { docId: doc, docVersion: 1, page: 1, passage: "Jane" } }));
      await expect(withTenant(owner, { tenantId: tA }, (tx) => tx`update facts set value = 'Other' where id = ${f}`)).rejects.toThrow(/only status may change/);
      await withTenant(app, { tenantId: tA }, (tx) => tx`update facts set status = 'accepted' where id = ${f}`);
      await expect(withTenant(app, { tenantId: tA }, (tx) => tx`update facts set status = 'rejected' where id = ${f}`)).rejects.toThrow(/final/);
    });
  });

  describe("human decision gate", () => {
    let c = "";
    beforeAll(async () => {
      c = (await withTenant(app, { tenantId: tA, userId: uwA }, (tx) => createCase(tx, tA, { caseRef: "DEC-1", docHashes: [] }))).id;
    });
    const dec = { decision: "approve" as const, reasons: ["Documents complete"], policyVersion: "1.0.0-placeholder" };

    it("a case cannot be approved by the pipeline without a decision", async () => {
      await expect(withTenant(app, { tenantId: tA }, (tx) => setCaseStatus(tx, c, "approved"))).rejects.toThrow(/requires a recorded human decision/);
    });
    it("a viewer cannot record a decision", async () => {
      await expect(withTenant(app, { tenantId: tA, userId: viewA }, (tx) => recordDecision(tx, tA, { caseId: c, userId: viewA, ...dec }))).rejects.toThrow(/row-level security/);
    });
    it("an underwriter cannot record a decision in someone else's name", async () => {
      await expect(withTenant(app, { tenantId: tA, userId: viewA }, (tx) => recordDecision(tx, tA, { caseId: c, userId: uwA, ...dec }))).rejects.toThrow(/row-level security/);
    });
    it("an underwriter of another tenant cannot decide this case", async () => {
      await expect(withTenant(app, { tenantId: tB, userId: uwB }, (tx) => recordDecision(tx, tB, { caseId: c, userId: uwB, ...dec }))).rejects.toThrow();
    });
    it("a decision needs at least one reason", async () => {
      await expect(withTenant(app, { tenantId: tA, userId: uwA }, (tx) => recordDecision(tx, tA, { caseId: c, userId: uwA, ...dec, reasons: [] }))).rejects.toThrow();
    });
    it("positive control: the underwriter records a decision, it is audited, and the case can then be approved", async () => {
      await withTenant(app, { tenantId: tA, userId: uwA }, (tx) => recordDecision(tx, tA, { caseId: c, userId: uwA, ...dec }));
      const audit = await withTenant(app, { tenantId: tA }, (tx) => tx`select actor_id, subject from audit_events where action = 'decision.recorded' and subject->>'caseId' = ${c}`);
      expect(audit).toHaveLength(1);
      expect(audit[0]!.actor_id).toBe(uwA);
      await withTenant(app, { tenantId: tA }, (tx) => setCaseStatus(tx, c, "approved"));
      const [row] = await withTenant(app, { tenantId: tA }, (tx) => tx<{ status: string }[]>`select status from cases where id = ${c}`);
      expect(row!.status).toBe("approved");
    });
    it("an approve decision cannot be used to mark the case declined", async () => {
      const c2 = (await withTenant(app, { tenantId: tA, userId: uwA }, (tx) => createCase(tx, tA, { caseRef: "DEC-2", docHashes: [] }))).id;
      await withTenant(app, { tenantId: tA, userId: uwA }, (tx) => recordDecision(tx, tA, { caseId: c2, userId: uwA, ...dec }));
      await expect(withTenant(app, { tenantId: tA }, (tx) => setCaseStatus(tx, c2, "declined"))).rejects.toThrow(/requires a recorded human decision/);
    });
    it("decisions are append-only for the app role and the owner", async () => {
      await expect(withTenant(app, { tenantId: tA }, (tx) => tx`update decisions set decision = 'decline'`)).rejects.toThrow();
      await expect(withTenant(app, { tenantId: tA }, (tx) => tx`delete from decisions`)).rejects.toThrow();
      // owner: forced RLS has no UPDATE/DELETE policy, so nothing is affected (positive control: the rows exist and are unchanged)
      const before = await withTenant(owner, { tenantId: tA }, (tx) => tx<{ decision: string }[]>`select decision from decisions order by created_at`);
      expect(before.length).toBeGreaterThan(0);
      const upd = await withTenant(owner, { tenantId: tA }, (tx) => tx`update decisions set decision = 'decline'`);
      const del = await withTenant(owner, { tenantId: tA }, (tx) => tx`delete from decisions`);
      expect([upd.count, del.count]).toEqual([0, 0]);
      expect(await withTenant(owner, { tenantId: tA }, (tx) => tx<{ decision: string }[]>`select decision from decisions order by created_at`)).toEqual(before);
      // trigger, independent of RLS: even a superuser (who bypasses RLS) is refused
      await expect(admin`update decisions set decision = 'decline'`).rejects.toThrow(/append-only/);
      await expect(admin`delete from decisions`).rejects.toThrow(/append-only/);
      await expect(owner`truncate decisions`).rejects.toThrow();
    });
  });

  describe("audit ledger", () => {
    it("is append-only for the app role and the owner", async () => {
      await withTenant(app, { tenantId: tA }, (tx) => appendAudit(tx, tA, { actorKind: "system", actorId: "t", action: "ledger.probe" }));
      await expect(withTenant(app, { tenantId: tA }, (tx) => tx`update audit_events set result = 'error'`)).rejects.toThrow();
      await expect(withTenant(app, { tenantId: tA }, (tx) => tx`delete from audit_events`)).rejects.toThrow();
      const n = await withTenant(owner, { tenantId: tA }, (tx) => tx<{ n: number }[]>`select count(*)::int as n from audit_events`);
      expect(n[0]!.n).toBeGreaterThan(0);
      expect((await withTenant(owner, { tenantId: tA }, (tx) => tx`delete from audit_events`)).count).toBe(0);
      expect((await withTenant(owner, { tenantId: tA }, (tx) => tx<{ n: number }[]>`select count(*)::int as n from audit_events`))[0]!.n).toBe(n[0]!.n);
      await expect(admin`delete from audit_events`).rejects.toThrow(/append-only/);
      await expect(admin`update audit_events set result = 'error'`).rejects.toThrow(/append-only/);
      await expect(owner`truncate audit_events`).rejects.toThrow();
    });
    it("chains events with contiguous sequence numbers under concurrency, and the chain verifies", async () => {
      const p = await provision("tenant-chain");
      await Promise.all(
        Array.from({ length: 25 }, (_, i) => withTenant(app, { tenantId: p.tenant }, (tx) => appendAudit(tx, p.tenant, { actorKind: "agent", actorId: "w", action: "fact.proposed", subject: { i } }))),
      );
      const seqs = await withTenant(app, { tenantId: p.tenant }, (tx) => tx<{ seq: string }[]>`select seq from audit_events order by seq`);
      expect(seqs.map((r) => Number(r.seq))).toEqual(Array.from({ length: 25 }, (_, i) => i + 1));
      expect(await withTenant(app, { tenantId: p.tenant }, (tx) => verifyAuditChain(tx))).toBeNull();
    });
    it("detects tampering by a privileged actor (negative control: the same chain verified clean before)", async () => {
      const p = await provision("tenant-tamper");
      for (let i = 0; i < 5; i++) await withTenant(app, { tenantId: p.tenant }, (tx) => appendAudit(tx, p.tenant, { actorKind: "system", actorId: "s", action: "e", subject: { i } }));
      expect(await withTenant(app, { tenantId: p.tenant }, (tx) => verifyAuditChain(tx))).toBeNull();
      await admin.begin(async (tx) => {
        await tx`alter table audit_events disable trigger audit_append_only`;
        await tx`set local row_security = off`;
        await tx`update audit_events set result = 'error' where tenant_id = ${p.tenant} and seq = 3`;
        await tx`alter table audit_events enable trigger audit_append_only`;
      });
      expect(await withTenant(app, { tenantId: p.tenant }, (tx) => verifyAuditChain(tx))).toBe(3);
    });
  });
});
