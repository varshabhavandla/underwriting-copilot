import { readFileSync, writeFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { chromium } from "playwright-core";
import postgres from "postgres";

const base = process.env.WALK_BASE, out = process.env.WALK_OUT, tenant = process.env.WALK_TENANT;
const STATUS = "p[role=status]:not([data-live])"; // the message banner, not the live-progress line
/** Clicks something that submits a form (a server action) and waits for its response, then for the page to settle. Works whether the browser submits the form
 *  as a full page load or, with client scripts running, updates the page in place. */
/** Waits for the page to go quiet, but never fails the run if the dev server keeps it busy (first compile, reloads): later steps wait for what they need. */
const idle = (page) => page.waitForLoadState("networkidle", { timeout: 45000 }).catch(() => undefined);
/** page.goto that survives the dev server reloading the page for a moment (it aborts a navigation that races with the reload). */
async function gotoSafe(page, url) {
  for (let i = 0; i < 4; i++) {
    try { await page.goto(url); return; } catch (e) { if (!/ERR_ABORTED|interrupted by another navigation/.test(String(e)) || i === 3) throw e; await new Promise((r) => setTimeout(r, 800)); }
  }
}
async function act(page, click) {
  const posted = page.waitForResponse((r) => r.request().method() === "POST" && !r.url().includes("/api/"), { timeout: 120000 }); // a cold dev server compiles the page and its action on first use
  await click();
  await posted;
  await idle(page);
  await page.waitForTimeout(300);
}
const packets = JSON.parse(readFileSync(process.env.WALK_PACKETS, "utf8"));
const rows = []; const issues = []; let failures = 0, n = 0;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
async function until(page, cond, ms = 20000) { for (let t = 0; t < ms; t += 100) { if (cond(new URL(page.url()))) return true; await sleep(100); } return false; }
function step(title, ok, detail = "") { n++; rows.push({ n, title, ok, detail }); console.log(`${ok ? "ok  " : "FAIL"} ${String(n).padStart(2)}. ${title}${ok || !detail ? "" : ` (${detail})`}`); if (!ok) failures++; }
const issue = (t) => { issues.push(t); console.log(`NOTE ${t}`); };
let shotN = 0;
async function shot(page, name) { shotN++; await page.screenshot({ path: join(out, `${String(shotN).padStart(2, "0")}-${name}.png`) }); }

const browserErrors = [];
const browser = await chromium.launch(process.env.PW_CHROMIUM ? { executablePath: process.env.PW_CHROMIUM } : {});
const owner = postgres(process.env.WALK_DB.replace(/\/\/[^@]*@/, "//uw_owner:uw_owner_dev@"), { onnotice: () => {}, max: 1 });
const asTenant = (fn) => owner.begin(async (tx) => { await tx`select set_config('app.tenant_id', ${tenant}, true)`; return fn(tx); });

async function signIn(label) {
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  ctx.setDefaultTimeout(120000); // the dev server compiles each page on first use, and may reload it once while doing so
  const page = await ctx.newPage();
  page.on("load", () => { if (process.env.WALK_DEBUG) console.log(`   [load] ${label} ${page.url().replace(/^https?:\/\/[^/]+/, "").slice(0, 80)}`); });
  page.on("response", (r) => { if (process.env.WALK_DEBUG && (r.status() >= 400 || /\/live/.test(r.url()))) console.log(`   [resp] ${label} ${r.status()} ${r.url().replace(/^https?:\/\/[^/]+/, "").slice(0, 90)}`); });
  page.on("pageerror", (e) => browserErrors.push(`${label}: ${String(e).slice(0, 160)}`));
  page.on("console", (m) => { if (m.type() === "error") browserErrors.push(`${label}: ${m.text().slice(0, 160)}`); });
  await gotoSafe(page, `${base}/review`);
  await page.click(`a:has-text("${label}")`);
  await until(page, (u) => u.origin === base && ["/review", "/forbidden"].includes(u.pathname));
  await idle(page);
  return { ctx, page };
}
async function api(page, method, path, data) {
  const r = await page.evaluate(async ([m, u, d]) => { const x = await fetch(u, { method: m, headers: d ? { "content-type": "application/json" } : {}, body: d ? JSON.stringify(d) : undefined }); return { status: x.status, text: await x.text() }; }, [method, path, data]);
  let json = null; try { json = JSON.parse(r.text); } catch { /* not json */ }
  return { status: r.status, json, text: r.text };
}
async function upload(page, caseId, doc) {
  return page.evaluate(async ([id, d]) => {
    const f = new FormData(); f.append("file", new File([d.text], d.name, { type: "text/plain" })); f.append("docType", d.type);
    const x = await fetch(`/api/applications/${id}/documents`, { method: "POST", body: f }); return { status: x.status, text: await x.text() };
  }, [caseId, doc]);
}
async function applyViaForm(page, legalName) {
  if (process.env.WALK_DEBUG && !page.__dbg) { page.__dbg = 1; page.on("console", (m) => console.log("   [console]", m.text().slice(0, 220))); page.on("requestfailed", (r) => console.log("   [requestfailed]", r.method(), r.url().slice(0, 100), r.failure()?.errorText)); page.on("response", (r) => { if (r.request().method() === "POST") console.log("   [POST]", r.status(), r.url().slice(0, 100)); }); }
  await gotoSafe(page, `${base}/apply`); await idle(page);
  await page.fill("[name=legalName]", legalName); await page.selectOption("[name=entityType]", "s_corp");
  await page.fill("[name=ein]", "12-3456789"); await page.fill("[name=naics]", "722511"); await page.fill("[name=yearsInBusiness]", "6");
  await page.fill("[name=requestedTermMonths]", "120"); await page.fill("[name=loanAmount]", "$250,000");
  await page.check("input[name=purposes][value=equipment]"); await page.fill("[name=owner1Name]", "Pat Owner"); await page.fill("[name=owner1Percent]", "100"); await page.check("[name=certifyAccurate]");
  await page.click("form:has(input[name=legalName]) button[type=submit]");
  await until(page, (u) => u.searchParams.has("submitted") || u.searchParams.has("error"));
  const u = new URL(page.url());
  if (process.env.WALK_DEBUG) console.log("   after submit:", page.url().slice(0, 140), "|", (await page.innerText("body")).slice(0, 200).replace(/\n/g, " / "));
  return { caseId: u.searchParams.get("submitted"), error: u.searchParams.get("error") };
}
const body = (page) => page.innerText("body");

try {
  // ---- A. staff sign in
  const proc = await signIn("Processor"), uw = await signIn("Underwriter"), view = await signIn("Viewer"), adm = await signIn("Admin");
  for (const [who, label] of [[proc, "processor"], [uw, "underwriter"], [view, "viewer"], [adm, "admin"]]) step(`${label} signs in through the identity provider`, new URL(who.page.url()).pathname === "/review" && (await body(who.page)).includes(`(${label})`));
  await shot(uw.page, "underwriter-empty-queue");

  // ---- B. intake: processor takes three applications through the form, uploads documents, builds files
  const cases = {};
  for (const pk of packets) {
    const r = await applyViaForm(proc.page, pk.legalName);
    step(`processor submits the application form for ${pk.key} (${pk.legalName})`, Boolean(r.caseId), r.error ?? "");
    if (pk.key === "clean") await shot(proc.page, "application-received");
    cases[pk.key] = r.caseId;
    await proc.page.click("a:has-text('Open the case to upload documents')");
    await until(proc.page, (u) => u.pathname === `/review/${r.caseId}`); await idle(proc.page);
    if (pk.key === "clean") await shot(proc.page, "case-before-documents");
    // upload through the console form, one document type at a time
    const byType = {}; for (const d of pk.docs) (byType[d.type] ??= []).push(d);
    let allOk = true; let lastMsg = "";
    for (const [type, docs] of Object.entries(byType)) {
      await proc.page.selectOption("select[name=docType]", type);
      await proc.page.setInputFiles("input[type=file][name=file]", docs.map((d, i) => ({ name: `${d.type}-${i + 1}.txt`, mimeType: "text/plain", buffer: Buffer.from(d.text) })));
      await proc.page.click("form:has(input[type=file]) button:has-text('Upload')");
      await until(proc.page, (u) => u.searchParams.has("msg"));
      await idle(proc.page);
      lastMsg = await proc.page.locator(STATUS).innerText().catch(() => "");
      if (/refused|choose at least/.test(lastMsg) || !/received and being processed/.test(lastMsg)) { allOk = false; console.log("   upload message:", lastMsg.slice(0, 200)); }
      // processing continues after the response; the page must follow it by itself. A marker on window proves the browser did not reload.
      await proc.page.evaluate(() => { window.__walkNoReload = true; });
      const expected = Object.values(byType).slice(0, Object.keys(byType).indexOf(type) + 1).reduce((n, g) => n + g.length, 0);
      try {
        await proc.page.waitForFunction((n) => { const li = [...document.querySelectorAll("[data-testid=documents] li")]; return li.length === n && li.every((x) => x.dataset.state === "done"); }, expected, { timeout: 60000 });
      } catch { allOk = false; console.log("   documents did not all reach done on their own"); }
      if (!(await proc.page.evaluate(() => window.__walkNoReload === true))) { allOk = false; console.log("   the page reloaded instead of updating itself"); }
    }
    step(`${pk.key}: ${pk.docs.length} documents uploaded through the case page, processed in the background, and shown live without a reload`, allOk, lastMsg.slice(0, 120));
    if (pk.key === "clean") { await shot(proc.page, "documents-uploaded"); }
    await proc.page.click("button:has-text('Build the file')");
    await until(proc.page, (u) => (u.searchParams.get("msg") ?? "").startsWith("File built")); await idle(proc.page);
    const bm = await proc.page.locator(STATUS).innerText().catch(() => "");
    step(`${pk.key}: file built from the case page (rules run, memo drafted, nothing approved)`, /File built/.test(bm) && /memo drafted and verified/.test(bm), bm.slice(0, 160));
    if (pk.key === "clean") { console.log("   build result:", bm.slice(0, 260)); await shot(proc.page, "file-built"); }
  }

  // ---- C. read-only and permission checks
  await gotoSafe(proc.page, `${base}/review`); await idle(proc.page);
  const q = await body(proc.page);
  step("the queue lists all three businesses with their open exceptions", packets.every((p) => q.includes(p.legalName)));
  await shot(proc.page, "queue-three-files");
  step("processor cannot record a decision (403)", (await api(proc.page, "POST", `/api/cases/${cases.clean}/decision`, { decision: "approve", reasons: ["x"], overrides: [] })).status === 403);
  await gotoSafe(view.page, `${base}/review/${cases.clean}`); await idle(view.page);
  step("viewer can read the file but sees no decision form", (await view.page.locator("button:has-text('Record decision')").count()) === 0 && (await body(view.page)).includes(packets[0].legalName));

  // ---- D. underwriter: the clean file
  const gotoCase = async (id) => { await gotoSafe(uw.page, `${base}/review/${id}`); await idle(uw.page); };
  await gotoCase(cases.clean);
  let t = await body(uw.page);
  step("clean file: facts, rule results, memo and open items are all on the page", ["Exceptions", "Rule results", "Facts with citations", "Credit memo draft", "Not evaluated by this tool"].every((h) => t.includes(h)), "missing a section");
  step("clean file: every accepted fact shows a source passage", (await uw.page.locator("table:has(th:has-text('Source passage')) tbody tr").count()) > 5);
  await shot(uw.page, "clean-file-top");
  await uw.page.locator("h2:has-text('Credit memo draft')").scrollIntoViewIfNeeded(); await shot(uw.page, "clean-file-memo");
  const adopt = uw.page.locator("button:has-text('Adopt this memo')");
  if (await adopt.count()) { await act(uw.page, () => adopt.click()); step("underwriter adopts the memo draft", (await body(uw.page)).includes("Memo adopted")); } else step("underwriter adopts the memo draft", false, "no adopt button");
  // dispose each open exception with a note
  let disposed = 0;
  for (let i = 0; i < 6; i++) {
    const btn = uw.page.locator("li:has(input[name=note]) button:has-text('Dispose')").first();
    if (!(await btn.count())) break;
    await uw.page.locator("li:has(input[name=note]) input[name=note]").first().fill("Reviewed against the source documents");
    await act(uw.page, () => btn.click()); disposed++;
  }
  step(`underwriter disposes the open exceptions with notes (${disposed})`, disposed >= 1 && (await body(uw.page)).includes("Exceptions (0 open)"));
  await uw.page.check("input[value=approve]"); await uw.page.fill("textarea[name=reasons]", "Cash flow supports the request; documents consistent"); await act(uw.page, () => uw.page.click("button:has-text('Record decision')"));
  t = await body(uw.page);
  step("underwriter approves the clean file", t.includes("Decision recorded: approved") || t.includes("Status: approved"), t.slice(0, 160));
  await shot(uw.page, "clean-file-approved");

  // ---- E. the file with the arithmetic error: the gate refuses, then a decline with reasons
  await gotoCase(cases.arith);
  t = await body(uw.page);
  const sev = /(critical|high) (bank_arithmetic|rule:[a-z-]+|[a-z_]+)/.exec(t);
  step("arithmetic-error file shows the planted exception", t.includes("bank_arithmetic"), t.slice(0, 200));
  await shot(uw.page, "arith-file-exceptions");
  await uw.page.check("input[value=approve]"); await uw.page.fill("textarea[name=reasons]", "Looks fine"); await act(uw.page, () => uw.page.click("button:has-text('Record decision')"));
  t = await body(uw.page);
  const gated = t.includes("requires at least one recorded override") || t.includes("Status: approved") === false;
  step("approving with an open high-severity exception and no override is refused", t.includes("override") && !t.includes("Status: approved"), t.slice(0, 200));
  await shot(uw.page, "arith-file-refused");
  await uw.page.check("input[value=decline]"); await uw.page.fill("textarea[name=reasons]", "Bank statement does not reconcile\nRequest corrected statements before resubmission"); await act(uw.page, () => uw.page.click("button:has-text('Record decision')"));
  step("underwriter declines it with written reasons", (await body(uw.page)).includes("declined"));

  // ---- F. the file with injected instructions: critical exception, approval needs a written override
  await gotoCase(cases.injection);
  t = await body(uw.page);
  step("injected-instruction file is flagged critical and its facts were held for review", t.includes("injection_suspected") && /critical/.test(t));
  await shot(uw.page, "injection-file");
  await uw.page.check("input[value=approve]"); await uw.page.fill("textarea[name=reasons]", "Figures re-checked by hand against the source"); await uw.page.fill("textarea[name=overrides]", "injection_suspected: underwriter re-verified every figure manually"); await act(uw.page, () => uw.page.click("button:has-text('Record decision')"));
  step("approval with a written override is recorded", (await body(uw.page)).includes("approved"));
  await shot(uw.page, "injection-file-approved");

  // ---- G. handoff to the (mock) servicing system after human approval only
  const dl = await fetch(`${base}/api/outbox/deliver`, { method: "POST", headers: { authorization: `Bearer ${process.env.WALK_WORKER}`, "content-type": "application/json" }, body: JSON.stringify({ tenantId: tenant }) });
  const dj = await dl.json();
  step("delivery run sends the three decision events and nothing fails", dl.status === 200 && dj.delivered === 3 && dj.failed === 0, JSON.stringify(dj));
  await gotoSafe(uw.page, `${base}/review`); await idle(uw.page); await shot(uw.page, "queue-after-decisions");
  const qt = await body(uw.page);
  step("queue shows 2 handed_off and 1 declined", (qt.match(/handed_off/g) ?? []).length === 2 && (qt.match(/declined/g) ?? []).length === 1, qt.slice(0, 300));

  // ---- H. admin: access and audit
  await gotoSafe(adm.page, `${base}/admin/audit`); await idle(adm.page); const at = await body(adm.page);
  step("security events show four sign-ins", (at.match(/auth\.login/g) ?? []).length >= 4);
  await shot(adm.page, "admin-security-events");
  await gotoSafe(adm.page, `${base}/admin/users`); await idle(adm.page); await shot(adm.page, "admin-users");
  await gotoSafe(uw.page, `${base}/account`); await idle(uw.page); step("underwriter sees their own session", (await body(uw.page)).includes("(this session)"));

  // ---- I. what the database says
  const dec = await asTenant((tx) => tx`select d.decision, array_length(d.reasons,1) as nr, array_length(d.overrides,1) as no, u.role, c.status from decisions d join users u on u.id = d.decided_by join cases c on c.id = d.case_id order by d.created_at`);
  step("three decisions recorded, all by an underwriter, with reasons", dec.length === 3 && dec.every((r) => r.role === "underwriter" && r.nr >= 1), JSON.stringify(dec));
  step("only the injected-instruction approval carries an override", dec.filter((r) => (r.no ?? 0) > 0).length === 1);
  const chain = await asTenant((tx) => tx`select audit_verify_chain() as r`);
  step("the tamper-evident audit chain verifies", chain[0].r === null, String(chain[0].r));
  const facts = await asTenant((tx) => tx`select count(*)::int as n, count(*) filter (where passage is null or length(passage) = 0)::int as bad from facts`);
  step(`every stored fact has a source passage (${facts[0].n} facts)`, facts[0].n > 20 && facts[0].bad === 0);
  const [{ n: memos }] = await asTenant((tx) => tx`select count(*)::int as n from memos`);
  step("a verified memo draft exists for each file", memos === 3, String(memos));
  const events = await asTenant((tx) => tx`select action, count(*)::int as n from audit_events group by action order by action`);
  console.log("   audit events:", events.map((e) => `${e.action}=${e.n}`).join(" "));
  const walk = (d) => readdirSync(d).flatMap((f) => { const p = join(d, f); return statSync(p).isDirectory() ? walk(p) : [p]; });
  const files = walk(process.env.WALK_UPLOADS);
  step(`${files.length} stored documents, none readable as plaintext`, files.length >= 9 && files.every((f) => !readFileSync(f).toString("latin1").includes("Net income")));
  const [{ ein_last4: l4, enc }] = await asTenant((tx) => tx`select ein_last4, encode(ein_ciphertext, 'escape') as enc from applications limit 1`);
  step("EIN is stored encrypted with only the last four digits in the clear", l4 === "6789" && !enc.includes("12-3456789"));
  const log = readFileSync(process.env.WALK_LOG, "utf8").split("\n").filter((l) => l.startsWith("{")).join("\n");
  step("the server log holds no EIN and no business name", !log.includes("12-3456789") && packets.every((p) => !log.includes(p.legalName)));

  // ---- J. sign out
  await gotoSafe(uw.page, `${base}/review`); await uw.page.click("button:has-text('Sign out')"); await until(uw.page, (u) => u.pathname === "/signed-out");
  step("clicking Sign out lands on a plain signed-out page (no redirect chain)", new URL(uw.page.url()).pathname === "/signed-out" && (await body(uw.page)).includes("You are signed out"));
  await shot(uw.page, "signed-out");
  await gotoSafe(uw.page, `${base}/review`); await until(uw.page, (u) => u.origin !== base);
  step("after signing out, protected pages send the browser back to the identity provider", new URL(uw.page.url()).origin !== base);
} catch (e) {
  console.error(e); failures++; rows.push({ n: ++n, title: "walkthrough crashed", ok: false, detail: String(e).slice(0, 200) });
} finally {
  for (const e of [...new Set(browserErrors)].slice(0, 12)) issues.push(`browser error: ${e}`);
  const md = ["# Walkthrough report", "", `Run ${new Date().toISOString()} on a fresh local stack (database, fake identity provider, web app). Synthetic data only. Screenshots are in this folder.`, "", "| # | Step | Result |", "|---|---|---|", ...rows.map((r) => `| ${r.n} | ${r.title} | ${r.ok ? "pass" : "FAIL " + r.detail.replace(/\|/g, "/").slice(0, 120)} |`), "", "## Gaps noticed while running it", ...(issues.length ? issues.map((i) => `- ${i}`) : ["- none"]), ""].join("\n");
  writeFileSync(join(out, "REPORT.md"), md);
  await owner.end(); await browser.close();
  console.log(`\n${rows.filter((r) => r.ok).length} of ${rows.length} steps passed`);
}
process.exit(failures ? 1 : 0);
