/**
 * End-to-end slice on synthetic data: packet -> case -> documents -> cited facts -> rules/exceptions -> needs_review
 * -> underwriter decision -> approved -> audit chain verified. Run: UW_TEST_ADMIN_URL=... npm run demo
 */
import { readFileSync, readdirSync } from "node:fs";
import { createHash } from "node:crypto";
import { join } from "node:path";
import postgres from "postgres";
import { connect, withTenant } from "../src/db/client";
import { migrate } from "../src/db/migrate";
import { addDocument, appendAudit, createCase, proposeFact, recordDecision, setCaseStatus, verifyAuditChain } from "../src/db/repo";
import { processPacket } from "../src/pipeline";
import type { Packet } from "../src/models";

const admin = process.env["UW_TEST_ADMIN_URL"];
if (!admin) throw new Error("set UW_TEST_ADMIN_URL to a disposable local Postgres");
const withDb = (user: string, pass: string, db: string) => {
  const u = new URL(admin);
  u.username = user; u.password = pass; u.pathname = `/${db}`;
  return u.toString();
};

const root = postgres(withDb(new URL(admin).username, new URL(admin).password, "postgres"), { onnotice: () => {}, max: 1 });
await root.unsafe(readFileSync(join(import.meta.dirname, "..", "db", "bootstrap", "roles.sql"), "utf8"));
await root.unsafe("drop database if exists uw_demo with (force)");
await root.unsafe("create database uw_demo owner uw_owner");
await root.end();
const owner = connect(withDb("uw_owner", "uw_owner_dev", "uw_demo"));
await migrate(owner);
const app = connect(withDb("uw_app", "uw_app_dev", "uw_demo"));

const [t] = await owner<{ id: string }[]>`select gen_random_uuid() as id`;
const tenant = t!.id;
const { uw } = await withTenant(owner, { tenantId: tenant }, async (tx) => {
  await tx`insert into tenants (id, name) values (${tenant}, 'Demo Community Bank')`;
  const [u] = await tx<{ id: string }[]>`insert into users (tenant_id, email, role) values (${tenant}, 'underwriter@demo.example', 'underwriter') returning id`;
  return { uw: u!.id };
});

const fixDir = join(import.meta.dirname, "..", "fixtures", "synthetic");
for (const name of readdirSync(fixDir).filter((f) => f.endsWith(".json")).sort()) {
  const fx = JSON.parse(readFileSync(join(fixDir, name), "utf8")) as { packet: any; expected: any };
  const p = fx.packet;
  const packet: Packet = {
    caseRef: p.case_ref,
    documents: p.documents,
    facts: p.facts.map((f: any) => ({ key: f.key, value: f.value, citation: { docId: f.citation.doc_id, docVersion: f.citation.doc_version, page: f.citation.page, passage: f.citation.passage } })),
  };
  const hashes = packet.documents.map((d) => createHash("sha256").update(d.pages.join("\n")).digest("hex"));
  const report = processPacket(packet);

  const caseId = await withTenant(app, { tenantId: tenant, userId: uw }, async (tx) => {
    const c = await createCase(tx, tenant, { caseRef: packet.caseRef, docHashes: hashes });
    const docIds = new Map<string, string>();
    for (const [i, d] of packet.documents.entries()) {
      docIds.set(d.id, await addDocument(tx, tenant, { caseId: c.id, docType: d.type, contentSha256: hashes[i]!, storageKey: `${tenant}/${c.id}/${hashes[i]}`, version: d.version }));
      await appendAudit(tx, tenant, { actorKind: "system", actorId: "ingest", action: "document.received", subject: { caseId: c.id, documentId: docIds.get(d.id) }, inputsRef: [hashes[i]!] });
    }
    for (const f of packet.facts) {
      await proposeFact(tx, tenant, { caseId: c.id, key: f.key, value: f.value, citation: { docId: docIds.get(f.citation.docId)!, docVersion: f.citation.docVersion, page: f.citation.page, passage: f.citation.passage } });
    }
    for (const r of report.checklist.results) {
      await appendAudit(tx, tenant, { actorKind: "system", actorId: "rules", action: "rule.evaluated", subject: { caseId: c.id, rule: r.ruleId, policyVersion: report.checklist.policyVersion }, result: r.outcome === "fail" ? "rejected" : "ok" });
    }
    await setCaseStatus(tx, c.id, "processing");
    await setCaseStatus(tx, c.id, "needs_review");
    return c.id;
  });

  const exceptions = report.missingDocuments.length + report.conflicts.length + report.injectionFlags.length + (report.checklist.passed ? 0 : 1);
  // Only a clean file is approved here, to show the gate; files with exceptions stay in review for a human.
  if (exceptions === 0) {
    await withTenant(app, { tenantId: tenant, userId: uw }, async (tx) => {
      await recordDecision(tx, tenant, { caseId: caseId, userId: uw, decision: "approve", reasons: ["All required documents present; checklist passed"], policyVersion: report.checklist.policyVersion });
      await setCaseStatus(tx, caseId, "approved");
    });
  }
  const [row] = await withTenant(app, { tenantId: tenant }, (tx) => tx<{ status: string }[]>`select status from cases where id = ${caseId}`);
  console.log(`${packet.caseRef.padEnd(8)} exceptions=${exceptions} status=${row!.status}`);
}

const broken = await withTenant(app, { tenantId: tenant }, (tx) => verifyAuditChain(tx));
const [n] = await withTenant(app, { tenantId: tenant }, (tx) => tx<{ n: number }[]>`select count(*)::int as n from audit_events`);
console.log(`audit events=${n!.n} chain=${broken === null ? "intact" : "BROKEN at " + broken}`);
await Promise.all([owner.end(), app.end()]);
process.exit(broken === null ? 0 : 1);
