import { randomBytes } from "node:crypto";
import { execSync } from "node:child_process";
import { writeFileSync } from "node:fs";
import { join } from "node:path";
import { LocalKeyProvider } from "../src/crypto/fieldCrypto";
import { connect } from "../src/db/client";
import { runPipelineEval } from "../src/eval/pipelineEval";
import { renderReport } from "../src/eval/report";
import { setupDatabase, withDb } from "./lib/setupDb";

const admin = process.env["UW_TEST_ADMIN_URL"];
if (!admin) throw new Error("set UW_TEST_ADMIN_URL to a disposable local Postgres");
const n = Number(process.env["EVAL_N"] ?? 10);
const { tenant, user } = await setupDatabase(admin, "uw_eval");
const app = connect(withDb(admin, "uw_app", "uw_app_dev", "uw_eval"));
const results = await runPipelineEval(app, { tenantId: tenant, userId: user }, new LocalKeyProvider(randomBytes(32)), n);
const adversarial = [] as { behavior: string; rs: Awaited<ReturnType<typeof runPipelineEval>> }[];
for (const [i, behavior] of (["hallucinate", "follow_injections", "garbage", "memo_fabricate", "memo_decide", "memo_miscite"] as const).entries()) {
  adversarial.push({ behavior, rs: await runPipelineEval(app, { tenantId: tenant, userId: user }, new LocalKeyProvider(randomBytes(32)), Math.min(n, 3), behavior, (i + 1) * 100_000) });
}
await app.end();
let commit = "unknown";
try { commit = execSync("git rev-parse --short HEAD", { cwd: import.meta.dirname }).toString().trim(); } catch { /* not a git checkout */ }
const md = renderReport(results, { n, commit, date: new Date().toISOString().slice(0, 10) }, adversarial);
const out = process.env["EVAL_OUT"] ?? join(import.meta.dirname, "..", "..", "reports", "EVALUATION_REPORT.md");
writeFileSync(out, md);
console.log(md.split("\n").slice(0, 60).join("\n"));
console.log(`\nwrote ${out}`);
