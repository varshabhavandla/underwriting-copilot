import { randomBytes } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { LocalKeyProvider } from "../../src/crypto/fieldCrypto";
import { connect, withTenant, type Sql } from "../../src/db/client";
import { runPipelineEval, type ClassResult } from "../../src/eval/pipelineEval";
import { FILE_CLASSES } from "../../src/synthetic/classes";
import { dbEnabled, urls } from "./urls";

describe.skipIf(!dbEnabled)("pipeline evaluation harness (real Postgres, mock provider)", () => {
  let owner: Sql, app: Sql;
  let tenant = "", user = "";
  let results: ClassResult[] = [];
  beforeAll(async () => {
    owner = connect(urls.owner()); app = connect(urls.app());
    const [t] = await owner<{ id: string }[]>`select gen_random_uuid() as id`;
    tenant = t!.id;
    user = await withTenant(owner, { tenantId: tenant }, async (tx) => {
      await tx`insert into tenants (id, name) values (${tenant}, 'eval')`;
      const [u] = await tx<{ id: string }[]>`insert into users (tenant_id, email, role) values (${tenant}, 'eval@example.test', 'underwriter') returning id`;
      return u!.id;
    });
    results = await runPipelineEval(app, { tenantId: tenant, userId: user }, new LocalKeyProvider(randomBytes(32)), 2);
  }, 120_000);
  afterAll(async () => { await Promise.all([owner.end(), app.end()]); });

  it("covers every class", () => expect(results.map((r) => r.cls.id)).toEqual(FILE_CLASSES.map((c) => c.id)));
  it("never accepts a wrong fact", () => { for (const r of results) expect(r.falseAccepts, r.cls.id).toBe(0); });
  it("detects every planted or expected exception", () => { for (const r of results) expect(r.detectedDefects, r.cls.id).toBe(r.expectedDefects); });
  it("raises no unexplained exceptions (false positives)", () => { for (const r of results) expect(r.falsePositivePackets, r.cls.id).toBe(0); });
  it("stores a verified memo for every packet", () => { for (const r of results) expect(r.memoVerified, r.cls.id).toBe(r.packets); });
  it("clean files are fully extracted and accepted; scanned files extract nothing (control: the harness can tell them apart)", () => {
    const clean = results.find((r) => r.cls.id === "clean")!, scanned = results.find((r) => r.cls.id === "scanned")!;
    expect(clean.acceptedCorrect).toBe(clean.truthFields);
    expect(scanned.notExtracted).toBe(scanned.truthFields);
    expect(scanned.acceptedCorrect).toBe(0);
  });
  it("injection and defect classes hold affected facts for a human instead of accepting them", () => {
    expect(results.find((r) => r.cls.id === "injection")!.proposedOnly).toBeGreaterThan(0);
    expect(results.find((r) => r.cls.id === "bank_arithmetic")!.proposedOnly).toBeGreaterThan(0);
  });
  it("no case was decided by the pipeline", async () => {
    const rows = await withTenant(app, { tenantId: tenant }, (tx) => tx<{ status: string }[]>`select distinct status from cases`);
    expect(rows.map((r) => r.status)).toEqual(["needs_review"]);
  });
});
