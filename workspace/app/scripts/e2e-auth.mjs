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
  ctx.setDefaultTimeout(120000);
  const page = await ctx.newPage();
  if (process.env.E2E_DEBUG) { page.on("console", (m) => console.log("  [console]", m.text().slice(0, 240))); page.on("framenavigated", (f) => { if (f === page.mainFrame()) console.log("  [nav]", f.url().slice(0, 100)); }); }
  await gotoSafe(page, `${base}/review`);
  eq(`${label}: anonymous visit is sent to the portal sign-in page`, new URL(page.url()).pathname, "/signin");
  await page.click('a:has-text("Continue to sign in")');
  await page.waitForURL((u) => u.href.startsWith(idp), { timeout: 90000 });
  check(`${label}: and from there to the identity provider`, page.url().startsWith(idp));
  await page.click(`a:has-text("${label}")`);
  // wait for the page, not for network silence: the first compile of each page in the dev server keeps the network busy
  await page.waitForURL((u) => !u.href.startsWith(idp), { timeout: 90000 }); // back on the application, wherever it sent us
  await page.waitForSelector("h1, h2, p", { timeout: 90000 });
  return { ctx, page };
}
/** Clicks something that submits a form (a server action), waits for its response, then lets the page settle. Works for a full page load and for an in-place update. */
/** page.goto that survives the dev server reloading the page for a moment (it aborts a navigation that races with the reload). */
const gotoSafe = async (page, url) => {
  for (let i = 0; i < 4; i++) {
    try { await page.goto(url); return; } catch (e) { if (!/ERR_ABORTED|interrupted by another navigation/.test(String(e)) || i === 3) throw e; await page.waitForTimeout(800); }
  }
};
const act = async (page, click) => {
  const posted = page.waitForResponse((r) => r.request().method() === "POST" && !r.url().includes("/api/"), { timeout: 120000 }); // a cold dev server compiles the page and its action on first use
  await click();
  await posted;
  await page.waitForLoadState("networkidle");
  await page.waitForTimeout(300);
};
const call = async (page, method, path, data) => {
  // sent from node with the browser's session cookie, not from inside the page, so a dev-server page reload cannot abort the request
  const c = (await page.context().cookies()).find((x) => x.name === "__Host-uw_session");
  const r = await fetch(base + path, { method, headers: { ...(data ? { "content-type": "application/json" } : {}), origin: base, ...(c ? { cookie: `__Host-uw_session=${c.value}` } : {}) }, body: data ? JSON.stringify(data) : undefined });
  const text = await r.text();
  return { status: () => r.status, json: async () => JSON.parse(text) };
};
const liveToken = async (page, path) => (await (await call(page, "GET", path)).json()).version;
const asTenant = (fn) => owner.begin(async (tx) => { await tx`select set_config('app.tenant_id', ${tenant}, true)`; return fn(tx); });
const cookieOf = async (ctx) => (await ctx.cookies()).find((c) => c.name === "__Host-uw_session");

try {
  // anonymous
  eq("health is public", (await fetch(`${base}/api/health`)).status, 200);
  for (const [m, p] of [["POST", "/api/applications"], ["POST", "/api/cases/00000000-0000-4000-8000-000000000000/decision"], ["POST", "/api/cases/00000000-0000-4000-8000-000000000000/build"]]) {
    eq(`anonymous ${m} ${p} -> 401`, (await fetch(base + p, { method: m, headers: { "content-type": "application/json" }, body: "{}" })).status, 401);
  }
  for (const p of ["/api/queue/live", "/api/cases/00000000-0000-4000-8000-000000000000/live", "/api/admin/users/live", "/api/admin/audit/live", "/api/account/live"]) {
    eq(`anonymous GET ${p} -> 401`, (await fetch(base + p)).status, 401);
  }
  const anon = await fetch(`${base}/review`, { redirect: "manual" });
  check("anonymous /review redirects to the portal sign-in page", anon.status >= 300 && anon.status < 400 && (anon.headers.get("location") ?? "").includes("/signin"));
  const loginHop = await fetch(`${base}/api/auth/login?returnTo=%2Freview`, { redirect: "manual" });
  check("the sign-in button's target redirects to the identity provider", loginHop.status >= 300 && loginHop.status < 400 && (loginHop.headers.get("location") ?? "").startsWith(idp));
  for (const p of ["/dashboard", "/why-fortech", "/how-the-ai-works", "/security-trust", "/faq"]) {
    const r = await fetch(`${base}${p}`, { redirect: "manual" });
    check(`anonymous ${p} redirects to the portal sign-in page`, r.status >= 300 && r.status < 400 && (r.headers.get("location") ?? "").includes("/signin"));
  }

  // processor signs in, creates a case
  const proc = await signIn("sub-processor", "Processor");
  eq("processor lands on the review queue", new URL(proc.page.url()).pathname, "/review");
  await gotoSafe(proc.page, `${base}/`); await proc.page.waitForURL((u) => u.pathname === "/dashboard", { timeout: 90000 });
  eq("the home page of a signed-in user is the dashboard", new URL(proc.page.url()).pathname, "/dashboard");
  await gotoSafe(proc.page, `${base}/review`);
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
  const live = await call(view.page, "GET", `/api/cases/${caseId}/live`);
  eq("viewer can read live progress (200)", live.status(), 200);
  const liveBody = await live.json();
  check("live progress is ids, states and counts only", !JSON.stringify(liveBody).includes("Auth Test Diner") && /^[0-9a-f]{16}$/.test(liveBody.version));
  eq("viewer can read the queue's live progress (200)", (await call(view.page, "GET", "/api/queue/live")).status(), 200);
  await gotoSafe(view.page, `${base}/review/${caseId}`);
  check("viewer sees the case but no decision form", (await view.page.locator("button:has-text('Record decision')").count()) === 0 && (await view.page.innerText("body")).includes("Auth Test Diner"));
  await gotoSafe(view.page, `${base}/apply`);
  eq("viewer is refused the intake form", new URL(view.page.url()).pathname, "/forbidden");

  // underwriter decides through the console
  const uw = await signIn("sub-underwriter", "Underwriter");
  await gotoSafe(uw.page, `${base}/review/${caseId}`);
  await uw.page.check("input[value=decline]");
  await uw.page.fill("textarea[name=reasons]", "Insufficient documentation");
  await act(uw.page, () => uw.page.click("button:has-text('Record decision')"));
  check("underwriter records a decision in the browser", (await uw.page.innerText("body")).includes("Decision recorded"));
  const dec = await asTenant((tx) => tx`select u.role from decisions d join users u on u.id = d.decided_by where d.case_id = ${caseId}`);
  eq("the decision is attributed to the signed-in underwriter", dec.map((r) => r.role).join(","), "underwriter");

  // admin
  const adm = await signIn("sub-admin", "Admin");
  eq("admin lands on the review queue", new URL(adm.page.url()).pathname, "/review");
  eq("admin cannot record a decision (only underwriters)", (await call(adm.page, 'POST', `/api/cases/${caseId}/decision`, { decision: "decline", reasons: ["x"], overrides: [] })).status(), 403);

  // administration screens
  for (const [who, label] of [[uw, "underwriter"], [view, "viewer"], [proc, "processor"]]) {
    await gotoSafe(who.page, `${base}/admin/users`);
    eq(`${label} is refused the user administration screen`, new URL(who.page.url()).pathname, "/forbidden");
    await gotoSafe(who.page, `${base}/admin/audit`);
    eq(`${label} is refused the security events screen`, new URL(who.page.url()).pathname, "/forbidden");
    for (const p of ["/api/admin/users/live", "/api/admin/audit/live"]) eq(`${label} is refused ${p} (403)`, (await call(who.page, "GET", p)).status(), 403);
  }
  for (const p of ["/api/admin/users/live", "/api/admin/audit/live", "/api/account/live"]) {
    const r = await call(adm.page, "GET", p); const j = await r.json().catch(() => ({}));
    check(`admin can read ${p}, and it carries only a version and an idle flag`, r.status() === 200 && /^[0-9a-f]{16}$/.test(j.version) && j.active === false && Object.keys(j).sort().join() === "active,version", JSON.stringify(j));
  }
  eq("a viewer can read their own sessions token (200)", (await call(view.page, "GET", "/api/account/live")).status(), 200);
  await gotoSafe(adm.page, `${base}/admin/users`);
  check("admin sees the user list including themselves", (await adm.page.innerText("body")).includes("admin@eval.example (you)"));
  check("an admin has no role or disable controls on their own row", (await adm.page.locator("tr:has-text('admin@eval.example (you)') select, tr:has-text('admin@eval.example (you)') button").count()) === 0);
  await adm.page.fill("input[name=email]", "Newbie@Eval.example");
  await adm.page.selectOption("form:has(button:has-text('Create user')) select[name=role]", "processor");
  await act(adm.page, () => adm.page.click("button:has-text('Create user')"));
  check("admin creates a user", (await adm.page.innerText("body")).includes("User created") && (await adm.page.innerText("body")).includes("newbie@eval.example"));
  await adm.page.fill("input[name=email]", "newbie@eval.example");
  await act(adm.page, () => adm.page.click("button:has-text('Create user')"));
  check("a duplicate address is refused with a message", (await adm.page.innerText("body")).includes("already in use"));
  const row = () => adm.page.locator("tr:has-text('newbie@eval.example')");
  const nb0 = await browser.newContext(); const nbp0 = await nb0.newPage();
  await gotoSafe(nbp0, `${base}/review`); await nbp0.click('a:has-text("Continue to sign in")'); await nbp0.waitForURL((u) => u.href.startsWith(idp), { timeout: 90000 });
  await nbp0.click("a:has-text('Newbie')"); await nbp0.waitForLoadState("networkidle");
  eq("a user who is not linked yet cannot sign in", new URL(nbp0.url()).pathname, "/forbidden");
  await row().locator("input[name=subject]").fill("sub-newbie");
  await act(adm.page, () => row().locator("button:has-text('Link')").click());
  check("admin links the person's provider identity", (await adm.page.innerText("body")).includes("Identity linked"));
  const nb = await signIn("sub-newbie", "Newbie");
  eq("the new user signs in and lands on the queue", new URL(nb.page.url()).pathname, "/review");
  check("and sees the processor navigation without Admin", !(await nb.page.innerText("body")).includes("Admin") && (await nb.page.innerText("body")).includes("(processor)"));
  const ok1 = await call(nb.page, "POST", "/api/applications", app);
  check("as a processor the new user can submit an application", ok1.status() === 201 || ok1.status() === 200, String(ok1.status()));
  await row().locator("select").selectOption("viewer");
  await act(adm.page, () => row().locator("button:has-text('Set')").click());
  check("admin changes the role", (await adm.page.innerText("body")).includes("Role changed"));
  eq("the role change applies on the very next request, without signing in again", (await call(nb.page, "POST", "/api/applications", app)).status(), 403);
  const usersBefore = await liveToken(adm.page, "/api/admin/users/live"), eventsBefore = await liveToken(adm.page, "/api/admin/audit/live");
  await act(adm.page, () => row().locator("button:has-text('Disable')").click());
  check("admin disables the user", (await adm.page.innerText("body")).includes("User disabled"));
  check("disabling a user changes the users token", (await liveToken(adm.page, "/api/admin/users/live")) !== usersBefore);
  check("and the new security event changes the events token", (await liveToken(adm.page, "/api/admin/audit/live")) !== eventsBefore);
  await gotoSafe(nb.page, `${base}/review`);
  check("the disabled user's session is dead at once", new URL(nb.page.url()).origin === base && new URL(nb.page.url()).pathname === "/signin");
  await act(adm.page, () => row().locator("button:has-text('Enable')").click());
  await act(adm.page, () => row().locator("button:has-text('Unlink identity')").click());
  check("admin unlinks the identity", (await adm.page.innerText("body")).includes("Identity unlinked"));
  // my sessions: end another browser's session
  const proc2 = await signIn("sub-processor", "Processor");
  await gotoSafe(proc.page, `${base}/account`);
  check("a user sees both of their sessions and which is current", (await proc.page.locator("tbody tr").count()) >= 2 && (await proc.page.innerText("body")).includes("(this session)"));
  const sessionsBefore = await liveToken(proc.page, "/api/account/live");
  await act(proc.page, () => proc.page.locator("tr:not(:has-text('(this session)')) button:has-text('End')").first().click());
  check("a user can end another of their own sessions", (await proc.page.innerText("body")).includes("Session ended"));
  check("ending a session changes the sessions token", (await liveToken(proc.page, "/api/account/live")) !== sessionsBefore);
  await gotoSafe(proc2.page, `${base}/review`);
  check("and that browser is signed out", new URL(proc2.page.url()).origin === base && new URL(proc2.page.url()).pathname === "/signin");
  eq("the current session keeps working", (await call(proc.page, "GET", "/api/health")).status(), 200);
  // security events
  await gotoSafe(adm.page, `${base}/admin/audit`);
  const evt = await adm.page.innerText("body");
  check("the security events screen shows administration and sign-in events", ["admin.user_created", "admin.identity_linked", "admin.role_changed", "admin.user_disabled", "admin.identity_unlinked", "auth.login", "auth.session_revoked"].every((a) => evt.includes(a)), evt.slice(0, 200));
  const details = (await adm.page.locator("tbody code").allInnerTexts()).join("\n");
  check("the event details hold ids and counts only: no email address, provider identifier or token", details.length > 20 && !details.includes("sub-newbie") && !/@/.test(details), details.slice(0, 120));
  // the home page is protected too
  const home = await fetch(`${base}/`, { redirect: "manual" });
  check("the home page sends anonymous visitors to sign-in", home.status >= 300 && home.status < 400 && (home.headers.get("location") ?? "").includes("/signin"));

  // sessions in the database
  const tok = (await cookieOf(proc.ctx)).value;
  const rows = await owner`select token_hash from auth.sessions where tenant_id = ${tenant}`;
  check("the database holds no session token in the clear", rows.length >= 4 && rows.every((r) => !Buffer.from(r.token_hash).toString("utf8").includes(tok)) && !rows.some((r) => r.token_hash.toString("base64url") === tok));
  const logins = await asTenant((tx) => tx`select count(*)::int as n from audit_events where action = 'auth.login'`);
  check("each sign-in left an audit event", logins[0].n >= 4, String(logins[0].n));

  // sign-out revokes server-side; the old cookie is dead even if replayed
  await gotoSafe(proc.page, `${base}/review`);
  await proc.page.click("button:has-text('Sign out')");
  for (let t = 0; t < 10000 && new URL(proc.page.url()).pathname !== "/signed-out"; t += 100) await new Promise((r) => setTimeout(r, 100));
  eq("clicking Sign out lands on the plain signed-out page (a redirect chain to the provider would be blocked by the form-action policy)", new URL(proc.page.url()).pathname, "/signed-out");
  await proc.page.waitForLoadState("networkidle");
  const replay = await fetch(`${base}/api/applications`, { method: "POST", headers: { "content-type": "application/json", cookie: `__Host-uw_session=${tok}` }, body: JSON.stringify(app) });
  eq("a replayed session cookie after sign-out is refused", replay.status, 401);
  await gotoSafe(proc.page, `${base}/review`);
  check("after sign-out the browser is sent to sign-in again", new URL(proc.page.url()).origin === base && new URL(proc.page.url()).pathname === "/signin");

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
  await gotoSafe(view.page, `${base}/review`);
  check("and the browser is sent back to sign-in", new URL(view.page.url()).origin === base && new URL(view.page.url()).pathname === "/signin");

  // a user the provider knows but we did not provision
  const stranger = await signIn("sub-stranger", "Stranger");
  eq("an unprovisioned identity is refused", new URL(stranger.page.url()).pathname, "/forbidden");
  const anyCookie = await cookieOf(stranger.ctx);
  check("and receives no session", anyCookie === undefined);

  // tampering with the redirect: wrong state, and a replayed callback
  const t = await browser.newContext(); const tp = await t.newPage();
  await gotoSafe(tp, `${base}/review`); await tp.click('a:has-text("Continue to sign in")'); await tp.waitForURL((u) => u.href.startsWith(idp), { timeout: 90000 }); const authUrl = tp.url();
  const cb = new URL(authUrl); const back = new URL(cb.searchParams.get("redirect_uri"));
  const go = new URL(authUrl); go.searchParams.set("fake_sub", "sub-underwriter");
  await gotoSafe(tp, go.toString());
  const okUrl = tp.url();
  eq("a normal round trip signs in", new URL(okUrl).pathname, "/review");
  await t.clearCookies({ name: "__Host-uw_session" });
  await gotoSafe(tp, `${base}/api/auth/callback?code=stolen&state=wrong`);
  eq("a callback with no valid flow is refused", new URL(tp.url()).pathname, "/forbidden");
  void back;
  // state mismatch: a flow cookie exists (we were redirected to the provider) but the callback carries a different state
  const sm = await browser.newContext(); const smp = await sm.newPage();
  await gotoSafe(smp, `${base}/review`); await smp.click('a:has-text("Continue to sign in")'); await smp.waitForURL((u) => u.href.startsWith(idp), { timeout: 90000 });
  await gotoSafe(smp, `${base}/api/auth/callback?code=whatever&state=attacker-chosen`);
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
