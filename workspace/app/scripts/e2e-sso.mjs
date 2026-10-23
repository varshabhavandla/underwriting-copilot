import { readFileSync } from "node:fs";
import { chromium } from "playwright-core";
import postgres from "postgres";

const base = process.env.E2E_BASE, issA = process.env.E2E_ISSA, issB = process.env.E2E_ISSB;
let failures = 0;
const check = (name, ok, detail = "") => { console.log(`${ok ? "ok  " : "FAIL"} ${name}${ok ? "" : ` ${detail}`}`); if (!ok) failures++; };
const eq = (name, got, want) => check(name, got === want, `expected [${want}] got [${got}]`);
const browser = await chromium.launch(process.env.PW_CHROMIUM ? { executablePath: process.env.PW_CHROMIUM } : {});
const owner = postgres(process.env.E2E_DB.replace(/\/\/[^@]*@/, "//uw_owner:uw_owner_dev@"), { onnotice: () => {}, max: 1 });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
/** Polls the address bar (page scripts die on navigation) until the condition holds. */
async function until(page, cond, ms = 15000) { for (let t = 0; t < ms; t += 100) { if (cond(new URL(page.url()))) return true; await sleep(100); } return false; }
const path = (page) => new URL(page.url()).pathname;
const call = async (page, method, p, data) => {
  // sent from node with the browser's session cookie, not from inside the page, so a dev-server page reload cannot abort the request
  const c = (await page.context().cookies()).find((x) => x.name === "__Host-uw_session");
  const r = await fetch(base + p, { method, headers: { ...(data ? { "content-type": "application/json" } : {}), origin: base, ...(c ? { cookie: `__Host-uw_session=${c.value}` } : {}) }, body: data ? JSON.stringify(data) : undefined });
  const text = await r.text();
  return { status: () => r.status, json: async () => JSON.parse(text) };
};
/** page.goto that survives the dev server reloading the page for a moment (it aborts a navigation that races with the reload). */
const gotoSafe = async (page, url) => {
  for (let i = 0; i < 4; i++) {
    try { await page.goto(url); return; } catch (e) { if (!/ERR_ABORTED|interrupted by another navigation/.test(String(e)) || i === 3) throw e; await sleep(800); }
  }
};
/** Clicks something that submits a form (a server action), waits for its response, then lets the page settle. Works for a full page load and for an in-place update. */
const act = async (page, click) => {
  const posted = page.waitForResponse((r) => r.request().method() === "POST" && !r.url().includes("/api/"), { timeout: 120000 }); // a cold dev server compiles the page and its action on first use
  await click();
  await posted;
  await page.waitForLoadState("networkidle");
  await sleep(300);
};
/** Sign in the way a person would: type the organization name, then pick a user at that organization's provider. */
async function signIn(org, label, ctx) {
  ctx ??= await browser.newContext();
  ctx.setDefaultTimeout(120000);
  const page = await ctx.newPage();
  if (process.env.E2E_DEBUG) { page.on("console", (m) => console.log("  [console]", m.text().slice(0, 200))); page.on("requestfailed", (r) => console.log("  [requestfailed]", r.url().slice(0, 120), r.failure()?.errorText)); }
  await gotoSafe(page, `${base}/review`);
  if (path(page) !== "/signin") return { ctx, page, reachedSignin: false };
  const basePort = new URL(base).port;
  await page.waitForLoadState("networkidle"); // let the page's script attach before typing
  await page.fill("input[name=org]", org);
  await page.click("button:has-text('Continue')");
  await until(page, (u) => u.port !== basePort || u.pathname === "/forbidden");
  if (new URL(page.url()).port !== basePort) {
    await page.click(`a:has-text("${label}")`);
    await until(page, (u) => u.port === basePort && ["/review", "/forbidden"].includes(u.pathname));
  }
  await page.waitForLoadState("networkidle");
  return { ctx, page, reachedSignin: true };
}

try {
  const anon = await browser.newPage(); await gotoSafe(anon, `${base}/review`);
  eq("anonymous visitors are sent to the organization sign-in page", path(anon), "/signin");
  check("which asks for an organization name", (await anon.locator("input[name=org]").count()) === 1);
  const home = await fetch(`${base}/`, { redirect: "manual" });
  check("the home page sends anonymous visitors to sign-in too", home.status >= 300 && home.status < 400 && (home.headers.get("location") ?? "").includes("/signin"));
  eq("the legacy login URL without an organization asks for one", new URL((await fetch(`${base}/api/auth/login`, { redirect: "manual" })).headers.get("location"), base).pathname, "/signin");

  // two organizations, each at its own provider, both with a user called sub-admin
  const A = await signIn("acme", "Admin");
  eq("acme's admin signs in through acme's provider", path(A.page), "/review");
  const B = await signIn("beta", "Admin");
  eq("beta's admin signs in through beta's provider", path(B.page), "/review");
  await gotoSafe(A.page, `${base}/admin/users`); await gotoSafe(B.page, `${base}/admin/users`);
  const ua = await A.page.innerText("body"), ub = await B.page.innerText("body");
  check("each admin sees only their own organization's users", ua.includes("admin@acme.example") && !ua.includes("admin@beta.example") && ub.includes("admin@beta.example") && !ub.includes("admin@acme.example"));
  const made = await call(A.page, "POST", "/api/applications", { legalName: "Acme Only Diner Inc", entityType: "s_corp", ein: "12-3456789", naics: "722511", yearsInBusiness: 6, requestedTermMonths: 120, loanAmount: "$250,000", purposes: ["working_capital"], owners: [{ name: "A Owner", percent: 100 }], certifyAccurate: true });
  eq("acme creates a case", made.status(), 201);
  await gotoSafe(B.page, `${base}/review`);
  check("beta cannot see acme's case", !(await B.page.innerText("body")).includes("Acme Only Diner"));

  // unknown and disabled organizations look the same
  const nope = await signIn("no-such-bank", "Admin");
  eq("an unknown organization ends at the generic no-access page", path(nope.page), "/forbidden");
  const unknownText = await nope.page.innerText("body");

  // an attacker tries to feed acme's callback a valid code from beta's provider
  const X = await browser.newContext(); const xp = await X.newPage();
  await gotoSafe(xp, `${base}/signin`); await xp.waitForLoadState("networkidle"); await xp.fill("input[name=org]", "acme");
  await xp.click("button:has-text('Continue')");
  await until(xp, (u) => u.port !== new URL(base).port);
  const authUrl = new URL(xp.url());
  const state = authUrl.searchParams.get("state");
  const atB = new URL(`${issB}/authorize`); for (const [k, v] of authUrl.searchParams) atB.searchParams.set(k, v); atB.searchParams.set("client_id", "uw-b"); atB.searchParams.set("fake_sub", "sub-admin");
  const codeFromB = new URL((await fetch(atB, { redirect: "manual" })).headers.get("location")).searchParams.get("code");
  check("(attacker obtained a valid code from beta's provider)", Boolean(codeFromB));
  await gotoSafe(xp, `${base}/api/auth/callback?code=${codeFromB}&state=${state}`);
  eq("a code from another organization's provider is refused", path(xp), "/forbidden");
  check("and no session was created", (await X.cookies()).find((c) => c.name === "__Host-uw_session") === undefined);

  // acme's admin looks at, tests and changes the provider settings
  await gotoSafe(A.page, `${base}/admin/sso`);
  const sso = await A.page.content();
  check("the settings page shows the organization name, callback URL and issuer", sso.includes("<strong>acme</strong>") && sso.includes(`${base}/api/auth/callback`) && sso.includes(issA));
  check("and never the client secret", !sso.includes(process.env.E2E_SECRET_A));
  await act(A.page, () => A.page.click("button:has-text('Test the provider')"));
  check("a connection test passes against the real provider", (await A.page.innerText("body")).includes(`identifies itself as ${issA}`));

  await A.page.fill("input[name=requiredAmr]", "hwk"); await act(A.page, () => A.page.click("button:has-text('Save')"));
  check("requiring a method the provider does not report is saved", (await A.page.innerText("body")).includes("saved"));
  const strict = await signIn("acme", "Admin");
  eq("and sign-in is then refused (required authentication method missing)", path(strict.page), "/forbidden");
  await A.page.fill("input[name=requiredAmr]", "mfa"); await act(A.page, () => A.page.click("button:has-text('Save')"));

  await A.page.fill("input[name=issuer]", issB); await act(A.page, () => A.page.click("button:has-text('Save')"));
  check("pointing at beta's provider is refused", (await A.page.innerText("body")).includes("already used by another organization"));
  await gotoSafe(A.page, `${base}/admin/sso`);

  await A.page.fill("input[name=issuer]", "https://169.254.169.254"); await A.page.uncheck("input[name=enabled]"); await act(A.page, () => A.page.click("button:has-text('Save')"));
  await act(A.page, () => A.page.click("button:has-text('Test the provider')"));
  check("a provider address pointing at cloud metadata is blocked by the connection test", (await A.page.innerText("body")).includes("insecure_endpoint"), (await A.page.innerText("body")).slice(0, 200));
  await A.page.fill("input[name=issuer]", issA); await A.page.check("input[name=enabled]"); await act(A.page, () => A.page.click("button:has-text('Save')"));
  check("acme's settings are restored", (await A.page.innerText("body")).includes("saved and enabled"));
  eq("acme's admin is still signed in throughout", (await call(A.page, "GET", "/api/health")).status(), 200);

  // disabling single sign-on is indistinguishable from an unknown organization
  await A.page.uncheck("input[name=enabled]"); await act(A.page, () => A.page.click("button:has-text('Save')"));
  const off = await signIn("acme", "Admin");
  eq("a disabled organization cannot sign in", path(off.page), "/forbidden");
  eq("and sees the same page as for an unknown organization", await off.page.innerText("body"), unknownText);
  await A.page.check("input[name=enabled]"); await act(A.page, () => A.page.click("button:has-text('Save')"));

  // linking a second person at acme's provider
  await gotoSafe(A.page, `${base}/admin/users`);
  await A.page.fill("input[name=email]", "viewer@acme.example"); await A.page.selectOption("form:has(button:has-text('Create user')) select[name=role]", "viewer"); await act(A.page, () => A.page.click("button:has-text('Create user')"));
  const row = A.page.locator("tr:has-text('viewer@acme.example')");
  await row.locator("input[name=subject]").fill("sub-viewer"); await act(A.page, () => row.locator("button:has-text('Link')").click());
  check("the admin links the new person to acme's provider", (await A.page.innerText("body")).includes("Identity linked"));
  const V = await signIn("acme", "Viewer");
  eq("and they can sign in as a viewer", path(V.page), "/review");
  check("with the viewer role", (await V.page.innerText("body")).includes("(viewer)"));
  await gotoSafe(V.page, `${base}/admin/sso`);
  eq("a viewer cannot open the single sign-on settings", path(V.page), "/forbidden");

  // secrets at rest and in logs
  const [{ enc }] = await owner`select encode(client_secret_enc, 'escape') as enc from auth.tenant_idps where slug = 'acme'`;
  check("the client secret is not stored in the clear", !enc.includes(process.env.E2E_SECRET_A));
  const ours = readFileSync(process.env.E2E_LOG, "utf8").split("\n").filter((l) => l.startsWith("{")).join("\n");
  check("our logs hold neither provider secret nor the attacker's code", ours.length > 100 && !ours.includes(process.env.E2E_SECRET_A) && !ours.includes(process.env.E2E_SECRET_B) && !ours.includes(codeFromB));
  check("rejections are logged with reasons", ["unknown_organization", "token_exchange_failed", "amr_missing"].every((r) => ours.includes(`"reason":"${r}"`)));
  const audits = await owner.begin(async (tx) => { await tx`select set_config('app.tenant_id', ${process.env.E2E_TENANT_A}, true)`; return tx`select count(*)::int as n from audit_events where action = 'admin.idp_configured'`; });
  check("every settings change is in the audit ledger", audits[0].n >= 5, String(audits[0].n));
} catch (e) {
  console.error(e);
  failures++;
} finally {
  await owner.end();
  await browser.close();
}
process.exit(failures ? 1 : 0);
