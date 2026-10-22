/**
 * Full local pipeline on synthetic data, no web server: application -> encrypted EIN -> document ingestion with cited facts ->
 * rule pack -> verified memo -> needs_review -> underwriter decision -> audit chain verified.
 * Run: UW_TEST_ADMIN_URL=... npm run demo
 */
import { createHash, randomBytes } from "node:crypto";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import postgres from "postgres";
import { submitApplication } from "../src/application/submit";
import { LocalKeyProvider } from "../src/crypto/fieldCrypto";
import { connect, withTenant } from "../src/db/client";
import { migrate } from "../src/db/migrate";
import { addDocument, recordDecision, setCaseStatus, verifyAuditChain } from "../src/db/repo";
import { buildFile } from "../src/file/buildFile";
import { ingestDocument } from "../src/ingest/ingest";
import { DEFAULT_OPTIONS, LlmGateway } from "../src/llm/gateway";
import { MockProvider } from "../src/llm/mockProvider";
import { makePacket, type Variant } from "../src/synthetic/generate";

const admin = process.env["UW_TEST_ADMIN_URL"];
if (!admin) throw new Error("set UW_TEST_ADMIN_URL to a disposable local Postgres");
const withDb = (user: string, pass: string, db: string) => {
  const u = new URL(admin);
  u.username = user; u.password = pass; u.pathname = `/${db}`;
  return u.toString();
};
const asOf = new Date("2026-10-21T00:00:00Z");

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
const uw = await withTenant(owner, { tenantId: tenant }, async (tx) => {
  await tx`insert into tenants (id, name) values (${tenant}, 'Demo Community Bank')`;
  const [u] = await tx<{ id: string }[]>`insert into users (tenant_id, email, role) values (${tenant}, 'underwriter@demo.example', 'underwriter') returning id`;
  return u!.id;
});
const ctx = { tenantId: tenant, userId: uw };
const keys = new LocalKeyProvider(randomBytes(32));
const gateway = () => new LlmGateway(new MockProvider("faithful"), DEFAULT_OPTIONS);

const variants: Variant[] = ["clean", "bank_arith_error", "balance_imbalance", "stale_statement", "income_mismatch", "injection"];
let approvedOne = false;
for (const [i, variant] of variants.entries()) {
  const pk = makePacket(500 + i, variant, asOf);
  const sub = await withTenant(app, ctx, (tx) => submitApplication(tx, keys, tenant, {
    legalName: pk.legalName, entityType: "s_corp", ein: "12-3456789", naics: "722511", yearsInBusiness: 6, requestedTermMonths: 120, loanAmount: "$250,000",
    purposes: ["equipment"], owners: [{ name: "A Owner", percent: 100 }], certifyAccurate: true,
  }));
  const ids: string[] = [];
  await withTenant(app, ctx, async (tx) => {
    for (const d of pk.docs) ids.push(await addDocument(tx, tenant, { caseId: sub.caseId, docType: d.type, contentSha256: createHash("sha256").update(d.pages.join("\n") + pk.caseRef).digest("hex"), storageKey: `${tenant}/${sub.caseId}/${d.id}` }));
  });
  const g = gateway();
  for (const [j, d] of pk.docs.entries()) await ingestDocument(app, g, asOf, ctx, { caseId: sub.caseId, documentId: ids[j]!, docVersion: 1, docType: d.type, pages: d.pages });
  const r = await buildFile(app, g, ctx, sub.caseId, asOf);
  const [ex] = await withTenant(app, ctx, (tx) => tx<{ n: number; kinds: string }[]>`select count(*)::int as n, string_agg(distinct kind, ',') as kinds from exceptions where case_id = ${sub.caseId} and kind not like 'rule:%'`);
  const [st] = await withTenant(app, ctx, (tx) => tx<{ status: string }[]>`select status from cases where id = ${sub.caseId}`);
  const rc = (o: string) => r.results.filter((x) => x.outcome === o).length;
  console.log(`${variant.padEnd(18)} memo=${r.memoStored ? "verified" : "REJECTED"} rules(pass/fail/review)=${rc("pass")}/${rc("fail")}/${rc("needs_review")} upstream-exceptions=${ex!.n}${ex!.kinds ? " [" + ex!.kinds + "]" : ""} status=${st!.status}`);
  if (variant === "clean" && !approvedOne) {
    // The underwriter reviews the prepared file and decides. Only this path can move a case to approved.
    await withTenant(app, ctx, async (tx) => {
      await recordDecision(tx, tenant, { caseId: sub.caseId, userId: uw, decision: "approve", reasons: ["Reviewed prepared file and cited evidence; open rule items accepted for follow-up"], policyVersion: "SOP 50 10 8.1" });
      await setCaseStatus(tx, sub.caseId, "approved");
    });
    const [after] = await withTenant(app, ctx, (tx) => tx<{ status: string }[]>`select status from cases where id = ${sub.caseId}`);
    console.log(`${"".padEnd(18)} underwriter decision recorded -> status=${after!.status}`);
    approvedOne = true;
  }
}
const broken = await withTenant(app, ctx, (tx) => verifyAuditChain(tx));
const [n] = await withTenant(app, ctx, (tx) => tx<{ n: number }[]>`select count(*)::int as n from audit_events`);
console.log(`audit events=${n!.n} chain=${broken === null ? "intact" : "BROKEN at " + broken}`);
await Promise.all([owner.end(), app.end()]);
process.exit(broken === null ? 0 : 1);
