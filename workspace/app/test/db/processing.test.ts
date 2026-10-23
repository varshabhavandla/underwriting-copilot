import { randomBytes, randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import postgres from "postgres";
import { LocalKeyProvider } from "../../src/crypto/fieldCrypto";
import { connect, withTenant, type Sql } from "../../src/db/client";
import { addDocument, createCase, verifyAuditChain } from "../../src/db/repo";
import { processDocument, queueProcessing, requeueStale, retryProcessing, stalledDocuments, claim } from "../../src/ingest/processing";
import { DEFAULT_OPTIONS, LlmGateway } from "../../src/llm/gateway";
import { MockProvider } from "../../src/llm/mockProvider";
import { caseLive, queueLive } from "../../src/review/live";
import type { Services } from "../../src/server/services";
import { objectKey, PgObjectStore, sha256Hex, type ObjectStore } from "../../src/storage/objectStore";
import { dbEnabled, urls } from "./urls";

const scans = join(__dirname, "..", "..", "fixtures", "synthetic", "scans");
const TEXT = "As of: 2026-09-21\nRevenue: $1,803,622.07\nNet income: $319,421.48\nTotal assets: $1,200,771.07\nTotal liabilities: $538,677.31\nTotal equity: $662,093.76";

describe.skipIf(!dbEnabled)("document processing state and live snapshots (real Postgres, D-039)", () => {
  let owner: Sql, app: Sql, admin: Sql, store: ObjectStore;
  let tenant = "", user = "", other = "";
  const keys = new LocalKeyProvider(randomBytes(32));
  const ctx = () => ({ tenantId: tenant, userId: user });
  const services = (over: Partial<Services> = {}): Services => ({
    sql: app, keys, store, gateway: new LlmGateway(new MockProvider("faithful"), DEFAULT_OPTIONS), servicing: undefined as never, scanner: undefined as never,
    tenantId: tenant, userId: user, role: "processor", sessionId: undefined, ...over,
  } as Services);

  beforeAll(async () => {
    owner = connect(urls.owner()); app = connect(urls.app()); admin = postgres(urls.adminOnTestDb(), { onnotice: () => {}, max: 1 });
    store = new PgObjectStore(app, keys);
    for (const tag of ["a", "b"]) {
      const id = randomUUID();
      const uid = await withTenant(owner, { tenantId: id }, async (tx) => {
        await tx`insert into tenants (id, name) values (${id}, ${"proc-" + tag})`;
        const [u] = await tx<{ id: string }[]>`insert into users (tenant_id, email, role) values (${id}, ${"proc-" + tag + "@example.test"}, 'processor') returning id`;
        return u!.id;
      });
      if (tag === "a") { tenant = id; user = uid; } else other = id;
    }
  });
  afterAll(async () => { await Promise.all([owner.end(), app.end(), admin.end()]); });

  let n = 0;
  /** A case with one document whose bytes are in the store and whose processing is queued (what the upload does). */
  async function queued(bytes = Buffer.from(TEXT), docType = "financial_statement") {
    const sha = sha256Hex(Buffer.concat([bytes, Buffer.from(String(n++))]));
    const caseId = await withTenant(app, ctx(), async (tx) => (await createCase(tx, tenant, { caseRef: "p-" + sha.slice(0, 8), docHashes: [sha] })).id);
    const key = objectKey(tenant, caseId, sha);
    await store.put(tenant, key, bytes);
    const documentId = await withTenant(app, ctx(), async (tx) => {
      const id = await addDocument(tx, tenant, { caseId, docType, contentSha256: sha, storageKey: key });
      await queueProcessing(tx, tenant, caseId, id);
      return id;
    });
    return { caseId, documentId };
  }
  const state = async (documentId: string) => (await withTenant(app, ctx(), (tx) => tx<{ status: string; attempts: number; error: string | null }[]>`select status, attempts, error from document_processing where document_id = ${documentId}`))[0]!;

  it("queued -> processing -> done, facts are extracted, and a second call finds nothing to do", async () => {
    const { caseId, documentId } = await queued();
    expect((await state(documentId)).status).toBe("queued");
    const p = await processDocument(services(), documentId);
    expect(p.skipped).toBe(false);
    expect(p.result?.factsAccepted).toBe(6);
    expect(await state(documentId)).toMatchObject({ status: "done", attempts: 1, error: null });
    expect((await processDocument(services(), documentId)).skipped).toBe(true); // idempotent
    expect((await withTenant(app, ctx(), (tx) => tx`select 1 from facts where case_id = ${caseId}`)).length).toBe(6);
  });

  it("only one worker can claim a document", async () => {
    const { documentId } = await queued();
    const claims = await Promise.all([claim(app, ctx(), documentId), claim(app, ctx(), documentId), claim(app, ctx(), documentId)]);
    expect(claims.filter(Boolean)).toHaveLength(1);
    expect((await state(documentId)).status).toBe("processing");
  });

  it("the database allows only legal moves and keeps identity columns fixed", async () => {
    const { documentId, caseId } = await queued();
    await processDocument(services(), documentId); // done
    await expect(admin`update document_processing set status = 'queued' where document_id = ${documentId}`).rejects.toThrow(/done -> queued is not allowed/);
    await expect(admin`update document_processing set status = 'processing' where document_id = ${documentId}`).rejects.toThrow(/not allowed/);
    await expect(withTenant(app, ctx(), (tx) => tx`update document_processing set case_id = ${randomUUID()} where document_id = ${documentId}`)).rejects.toThrow();
    await expect(withTenant(app, ctx(), (tx) => tx`delete from document_processing where document_id = ${documentId}`)).rejects.toThrow(); // no delete grant
    expect(caseId).toBeTruthy();
  });

  it("a failure becomes visible and retryable, with a generic reason and an audit event, and a retry succeeds", async () => {
    const { documentId } = await queued();
    const broken: ObjectStore = { put: store.put.bind(store), get: async () => { throw new Error("disk exploded with secret detail Revenue: $5"); } } as ObjectStore;
    const p = await processDocument(services({ store: broken }), documentId);
    expect(p.result).toBeUndefined();
    const st = await state(documentId);
    expect(st.status).toBe("failed");
    expect(st.error).toBe("processing did not finish; it can be retried");
    expect(JSON.stringify(st)).not.toContain("secret");
    expect((await withTenant(app, ctx(), (tx) => tx`select 1 from audit_events where action = 'document.processing_failed' and subject->>'documentId' = ${documentId}`)).length).toBe(1);
    expect(await retryProcessing(app, ctx(), documentId)).toBe(true);
    expect(await retryProcessing(app, ctx(), documentId)).toBe(false); // control: only a failed document can be retried
    const again = await processDocument(services(), documentId);
    expect(again.result?.factsAccepted).toBe(6);
    expect(await state(documentId)).toMatchObject({ status: "done", attempts: 2 });
  });

  it("a scan that no program can read ends done, with a manual-review exception (not stuck)", async () => {
    const { documentId, caseId } = await queued(readFileSync(join(scans, "statement.png")));
    const saved = process.env["PATH"];
    process.env["PATH"] = "/nonexistent";
    const { resetToolCheck } = await import("../../src/ingest/readDocument");
    resetToolCheck();
    try {
      const p = await processDocument(services(), documentId);
      expect(p.manualReview).toBe(true);
    } finally { process.env["PATH"] = saved; resetToolCheck(); }
    expect((await state(documentId)).status).toBe("done");
    expect((await withTenant(app, ctx(), (tx) => tx<{ kind: string }[]>`select kind from exceptions where case_id = ${caseId}`)).map((e) => e.kind)).toEqual(["ocr_required"]);
  });

  it("abandoned work is found: a long-processing document goes back to the queue, an idle queued one is picked up", async () => {
    const a = await queued(), b = await queued();
    await claim(app, ctx(), a.documentId);
    await withTenant(owner, { tenantId: tenant }, (tx) => tx`update document_processing set started_at = now() - interval '11 minutes' where document_id = ${a.documentId}`);
    await withTenant(owner, { tenantId: tenant }, (tx) => tx`update document_processing set queued_at = queued_at where document_id = ${b.documentId}`);
    expect(await requeueStale(app, ctx())).toContain(a.documentId);
    expect((await state(a.documentId)).status).toBe("queued");
    // queued_at is immutable by design, so age a fresh document the only way possible: a new row created in the past by the owner
    const c = await queued();
    await withTenant(owner, { tenantId: tenant }, async (tx) => { await tx`alter table document_processing disable trigger document_processing_guard_trg`; await tx`update document_processing set queued_at = now() - interval '1 minute' where document_id = ${c.documentId}`; await tx`alter table document_processing enable trigger document_processing_guard_trg`; });
    expect(await stalledDocuments(app, ctx(), c.caseId)).toEqual([c.documentId]);
    expect(await stalledDocuments(app, ctx(), b.caseId)).toEqual([]); // control: a document queued just now is left alone
  });

  it("another lender cannot see, claim or retry a document's processing", async () => {
    const { documentId } = await queued();
    const foreign = { tenantId: other };
    expect(await withTenant(app, foreign, (tx) => tx`select 1 from document_processing where document_id = ${documentId}`)).toHaveLength(0);
    expect(await claim(app, foreign, documentId)).toBe(false);
    expect((await state(documentId)).status).toBe("queued");
  });

  it("the live snapshot carries ids, states and counts only, changes when state changes, and is empty for a foreign case", async () => {
    const { caseId, documentId } = await queued();
    const snap = async () => (await withTenant(app, ctx(), (tx) => caseLive(tx, caseId)))!;
    const s1 = await snap();
    expect(s1.active).toBe(true);
    expect(s1.documents).toEqual([{ id: documentId, docType: "financial_statement", processing: "queued", error: null }]);
    await processDocument(services(), documentId);
    const s2 = await snap();
    expect(s2.active).toBe(false);
    expect(s2.facts.accepted).toBe(6);
    expect(s2.version).not.toBe(s1.version);
    expect((await snap()).version).toBe(s2.version); // stable when nothing changed
    const text = JSON.stringify(s2);
    for (const secret of ["1,803,622.07", "Revenue", "proc-a@example.test"]) expect(text).not.toContain(secret);
    expect(await withTenant(app, { tenantId: other }, (tx) => caseLive(tx, caseId))).toBeNull();
    const q = await withTenant(app, ctx(), (tx) => queueLive(tx));
    expect(q.cases.find((c) => c.id === caseId)).toMatchObject({ processing: 0, hasMemo: false });
    expect(q.version).toMatch(/^[0-9a-f]{16}$/);
    expect(await withTenant(app, ctx(), (tx) => verifyAuditChain(tx))).toBeNull();
  });
});
