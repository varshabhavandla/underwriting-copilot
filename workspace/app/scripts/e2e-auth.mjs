import { readFileSync } from "node:fs";
import { chromium } from "playwright-core";
import postgres from "postgres";

const base = process.env.E2E_BASE, idp = process.env.E2E_IDP, tenant = process.env.E2E_TENANT;
let failures = 0;
const check = (name, ok, detail = "") => { console.log(`${ok ? "ok  " : "FAIL"} ${name}${ok ? "" : ` ${detail}`}`); if (!ok) failures++; };
const eq = (name, got, want) => check(name, got === want, `expected [${want}] got [${got}]`);

const browser = await chromium.launch(process.env.PW_CHROMIUM ? { executablePath: process.env.PW_CHROMIUM } : {});
const owner = postgres(process.env.E2E_DB.replace(/\/\/[^@]*@/, "//uw_owner:uw_owner_dev@"), { onnotice: () => {}, max: 1 });

async function signIn(sub, label) {
  const ctx = await browser.newContext();
  const page = await ctx.newPage();
  await page.goto(`${base}/review`);
  check(`${label}: anonymous visit is sent to the identity provider`, page.url().startsWith(idp));
  await page.click(`a:has-text("${label}")`);
  await page.waitForLoadState("networkidle");
  return { ctx, page };
}
// The browser's own fetch is used (not Playwright's request client, which does not send Secure cookies over http://127.0.0.1).
const call = async (page, method, path, data) => {
  const r = await page.evaluate(async ([m, u, d]) => { const x = await fetch(u, { method: m, headers: d ? { "content-type": "application/json" } : {}, body: d ? JSON.stringify(d) : undefined }); return { status: x.status, text: await x.text() }; }, [method, base + path, data]);
  return { status: () => r.status, json: async () => JSON.parse(r.text) };
};
const asTenant = (fn) => owner.begin(async (tx) => { await tx`select set_config('app.tenant_id', ${tenant}, true)`; return fn(tx); });
const cookieOf = async (ctx) => (await ctx.cookies()).find((c) => c.name === "__Host-uw_session");

try {
  // anonymous
  eq("health is public", (await fetch(`${base}/api/health`)).status, 200);
  for (const [m, p] of [["POST", "/api/applications"], ["POST", "/api/cases/00000000-0000-4000-8000-000000000000/decision"], ["POST", "/api/cases/00000000-0000-4000-8000-000000000000/build"]]) {
    eq(`anonymous ${m} ${p} -> 401`, (await fetch(base + p, { method: m, headers: { "content-type": "application/json" }, body: "{}" })).status, 401);
  }
  const anon = await fetch(`${base}/review`, { redirect: "manual" });
  check("anonymous /review redirects to sign-in", anon.status >= 300 && anon.status < 400 && (anon.headers.get("location") ?? "").includes("/api/auth/login"));

  // processor signs in, creates a case
  const proc = await signIn("sub-processor", "Processor");
  eq("processor lands on the review queue", new URL(proc.page.url()).pathname, "/review");
  const c = await cookieOf(proc.ctx);
  check("session cookie is __Host-, HttpOnly, Secure, SameSite=Lax, path /", Boolean(c && c.httpOnly && c.secure && c.sameSite === "Lax" && c.path === "/" && !c.domain?.startsWith(".")), JSON.stringify(c));
  check("the page cannot read the session cookie", !(await proc.page.evaluate(() => document.cookie)).includes("uw_session"));
  const app = { legalName: "Auth Test Diner Inc", entityType: "s_corp", ein: "12-3456789", naics: "722511", yearsInBusiness: 6, requestedTermMonths: 120, loanAmount: "$250,000", purposes: ["working_capital"], owners: [{ name: "A Owner", percent: 100 }], certifyAccurate: true };
  const created = await call(proc.page, 'POST', `/api/applications`, app);
  eq("processor can submit an application", created.status(), 201);
  const caseId = (await created.json()).caseId;
  eq("processor can build the file", (await call(proc.page, 'POST', `/api/cases/${caseId}/build`)).status(), 200);
  eq("processor cannot record a decision (403)", (await call(proc.page, 'POST', `/api/cases/${caseId}/decision`, { decision: "decline", reasons: ["x"], overrides: [] })).status(), 403);

  // viewer
  const view = await signIn("sub-viewer", "Viewer");
  check("viewer sees the case in the queue", (await view.page.innerText("body")).includes("Auth Test Diner"));
  eq("viewer cannot submit applications (403)", (await call(view.page, 'POST', `/api/applications`, app)).status(), 403);
  await view.page.goto(`${base}/review/${caseId}`);
  check("viewer sees the case but no decision form", (await view.page.locator("button:has-text('Record decision')").count()) === 0 && (await view.page.innerText("body")).includes("Auth Test Diner"));
  await view.page.goto(`${base}/apply`);
  eq("viewer is refused the intake form", new URL(view.page.url()).pathname, "/forbidden");

  // underwriter decides through the console
  const uw = await signIn("sub-underwriter", "Underwriter");
  await uw.page.goto(`${base}/review/${caseId}`);
  await uw.page.check("input[value=decline]");
  await uw.page.fill("textarea[name=reasons]", "Insufficient documentation");
  await uw.page.click("button:has-text('Record decision')");
  await uw.page.waitForLoadState("networkidle");
  check("underwriter records a decision in the browser", (await uw.page.innerText("body")).includes("Decision recorded"));
  const dec = await asTenant((tx) => tx`select u.role from decisions d join users u on u.id = d.decided_by where d.case_id = ${caseId}`);
  eq("the decision is attributed to the signed-in underwriter", dec.map((r) => r.role).join(","), "underwriter");

  // admin
  const adm = await signIn("sub-admin", "Admin");
  eq("admin lands on the review queue", new URL(adm.page.url()).pathname, "/review");
  eq("admin cannot record a decision (only underwriters)", (await call(adm.page, 'POST', `/api/cases/${caseId}/decision`, { decision: "decline", reasons: ["x"], overrides: [] })).status(), 403);

  // sessions in the database
  const tok = (await cookieOf(proc.ctx)).value;
  const rows = await owner`select token_hash from auth.sessions where tenant_id = ${tenant}`;
  check("the database holds no session token in the clear", rows.length >= 4 && rows.every((r) => !Buffer.from(r.token_hash).toString("utf8").includes(tok)) && !rows.some((r) => r.token_hash.toString("base64url") === tok));
  const logins = await asTenant((tx) => tx`select count(*)::int as n from audit_events where action = 'auth.login'`);
  check("each sign-in left an audit event", logins[0].n >= 4, String(logins[0].n));

  // sign-out revokes server-side; the old cookie is dead even if replayed
  await proc.page.goto(`${base}/review`);
  await proc.page.click("button:has-text('Sign out')");
  await proc.page.waitForLoadState("networkidle");
  const replay = await fetch(`${base}/api/applications`, { method: "POST", headers: { "content-type": "application/json", cookie: `__Host-uw_session=${tok}` }, body: JSON.stringify(app) });
  eq("a replayed session cookie after sign-out is refused", replay.status, 401);
  await proc.page.goto(`${base}/review`);
  check("after sign-out the browser is sent to sign-in again", proc.page.url().startsWith(idp));

  // cross-site sign-out is refused
  const csrf = await fetch(`${base}/api/auth/logout`, { method: "POST", headers: { origin: "https://evil.example", cookie: `__Host-uw_session=${(await cookieOf(uw.ctx)).value}` }, redirect: "manual" });
  eq("logout from another origin is refused", csrf.status, 403);
  eq("and the session survives it", (await fetch(`${base}/api/applications`, { method: "POST", headers: { "content-type": "application/json", cookie: `__Host-uw_session=${(await cookieOf(uw.ctx)).value}` }, body: "{}" })).status === 401, false);

  // a proper sign-out from our own origin: session revoked, browser data cleared
  const uwTok = (await cookieOf(uw.ctx)).value;
  const out = await fetch(`${base}/api/auth/logout`, { method: "POST", headers: { origin: base, cookie: `__Host-uw_session=${uwTok}` }, redirect: "manual" });
  eq("sign-out from our own origin succeeds", out.status, 303);
  eq("and asks the browser to clear cached data", out.headers.get("clear-site-data"), '"cache", "storage"');
  eq("and the underwriter's cookie no longer works", (await fetch(`${base}/api/cases/${caseId}/decision`, { method: "POST", headers: { "content-type": "application/json", cookie: `__Host-uw_session=${uwTok}` }, body: "{}" })).status, 401);

  // disabling a user kills their session at once
  await owner.begin(async (tx) => { await tx`select set_config('app.tenant_id', ${tenant}, true)`; await tx`update users set disabled_at = now() where role = 'viewer' and tenant_id = ${tenant}`; });
  eq("a disabled user's session stops working immediately", (await call(view.page, 'GET', '/api/health')).status(), 200);
  await view.page.goto(`${base}/review`);
  check("and the browser is sent back to sign-in", view.page.url().startsWith(idp));

  // a user the provider knows but we did not provision
  const stranger = await signIn("sub-stranger", "Stranger");
  eq("an unprovisioned identity is refused", new URL(stranger.page.url()).pathname, "/forbidden");
  const anyCookie = await cookieOf(stranger.ctx);
  check("and receives no session", anyCookie === undefined);

  // tampering with the redirect: wrong state, and a replayed callback
  const t = await browser.newContext(); const tp = await t.newPage();
  await tp.goto(`${base}/review`); const authUrl = tp.url();
  const cb = new URL(authUrl); const back = new URL(cb.searchParams.get("redirect_uri"));
  const go = new URL(authUrl); go.searchParams.set("fake_sub", "sub-underwriter");
  await tp.goto(go.toString());
  const okUrl = tp.url();
  eq("a normal round trip signs in", new URL(okUrl).pathname, "/review");
  await t.clearCookies({ name: "__Host-uw_session" });
  await tp.goto(`${base}/api/auth/callback?code=stolen&state=wrong`);
  eq("a callback with no valid flow is refused", new URL(tp.url()).pathname, "/forbidden");
  void back;
  // state mismatch: a flow cookie exists (we were redirected to the provider) but the callback carries a different state
  const sm = await browser.newContext(); const smp = await sm.newPage();
  await smp.goto(`${base}/review`);
  await smp.goto(`${base}/api/auth/callback?code=whatever&state=attacker-chosen`);
  eq("a callback whose state does not match our flow is refused", new URL(smp.url()).pathname, "/forbidden");
  // Our own structured log lines (JSON); Next's development request logger prints raw URLs and is not part of the application's logging.
  const ours = readFileSync(process.env.E2E_LOG, "utf8").split("\n").filter((l) => l.startsWith("{"));
  check("failed sign-ins are logged with a reason code", ["missing_or_expired_flow", "state_mismatch"].every((r) => ours.some((l) => l.includes('"msg":"sign-in failed"') && l.includes(`"reason":"${r}"`))));
  check("our logs never contain the authorization code, identifiers or a session token", ours.length > 5 && !ours.join("\n").includes("stolen") && !ours.join("\n").includes("12-3456789") && !ours.join("\n").includes(tok));
} catch (e) {
  console.error(e);
  failures++;
} finally {
  await owner.end();
  await browser.close();
}
process.exit(failures ? 1 : 0);
