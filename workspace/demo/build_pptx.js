// Builds Underwriting_Copilot_Team_Deck.pptx from the walkthrough screenshots. Run from this folder: node build_pptx.js
// Needs pptxgenjs, and the pptx skill's apply_theme.js (set APPLY_THEME to its path) so the theme colors are written into the file.
const pptxgen = require("pptxgenjs");
const path = require("path");
const APPLY = process.env.APPLY_THEME || "/root/.claude/skills/synced/121e853f-7d4a-404b-a0a9-a3f1a5eacb2d_896bda88-7d38-4429-a363-1b03d5634858/pptx/scripts/apply_theme.js";
const { applyTheme } = require(APPLY);
const W = path.join(__dirname, "walkthrough");
const shot = (n) => path.join(W, n + ".png");

const THEME = {
  name: "Underwriting copilot",
  headFontFace: "Cambria",
  bodyFontFace: "Calibri",
  colors: {
    dk1: "17212B", lt1: "FFFFFF", dk2: "0F2540", lt2: "EEF2F6",
    accent1: "1B998B", accent2: "E0962E", accent3: "3D6FB6", accent4: "C0463B", accent5: "6B7B8C", accent6: "7C5CBF",
    hlink: "3D6FB6", folHlink: "6B7B8C",
  },
};

const pres = new pptxgen();
pres.layout = "LAYOUT_WIDE"; // 13.33 x 7.5
pres.theme = { headFontFace: THEME.headFontFace, bodyFontFace: THEME.bodyFontFace };
pres.title = "Underwriting copilot: team deck";
pres.author = "Underwriting copilot project";
const C = pres.SchemeColor;

pres.defineSlideMaster({
  title: "DARK", background: { color: C.text2 },
  objects: [],
  slideNumber: { x: 12.2, y: 7.0, w: 0.6, h: 0.3, color: C.accent5, fontSize: 10, align: "right" },
});
pres.defineSlideMaster({
  title: "LIGHT", background: { color: C.background1 },
  objects: [
    { text: { text: "Synthetic data only. A human underwriter makes every credit decision.", options: { x: 0.6, y: 7.0, w: 9, h: 0.3, fontSize: 10, color: C.accent5, margin: 0, isTextBox: true } } },
    { placeholder: { options: { name: "title", type: "title", x: 0.6, y: 0.4, w: 12.1, h: 0.9, fontSize: 32, bold: true, color: C.text2, fontFace: "Cambria", valign: "middle", align: "left", margin: 0 }, text: "" } },
  ],
  slideNumber: { x: 12.2, y: 7.0, w: 0.6, h: 0.3, color: C.accent5, fontSize: 10, align: "right" },
});

let n = 0;
function light(title, notes) {
  const s = pres.addSlide({ masterName: "LIGHT" });
  s.addText(title, { placeholder: "title" });
  s.addNotes(notes);
  return s;
}
const card = (s, x, y, w, h, name) => s.addShape(pres.ShapeType.roundRect, { x, y, w, h, rectRadius: 0.08, fill: { color: C.background2 }, line: { color: C.background2, width: 0 }, objectName: name || "card" });
const txt = (s, t, o) => s.addText(t, Object.assign({ isTextBox: true, margin: 0, fontFace: "Calibri", color: C.text1, valign: "top" }, o));
function pic(s, name, x, y, w, caption, cy) {
  const h = w / 1.6;
  s.addImage({ path: shot(name), x, y, w, h, objectName: "screenshot " + name, altText: caption });
  txt(s, caption, { x, y: y + h + 0.12, w, h: 0.75, fontSize: 14, color: C.text1 });
}

// 1. Title
{
  const s = pres.addSlide({ masterName: "DARK" });
  txt(s, "AI-assisted loan file preparation", { x: 0.9, y: 2.1, w: 11.5, h: 1.2, fontSize: 48, bold: true, fontFace: "Cambria", color: C.background1 });
  txt(s, "An underwriting copilot, SBA 7(a) first", { x: 0.9, y: 3.35, w: 11.5, h: 0.6, fontSize: 24, color: C.background2 });
  txt(s, "The tool prepares the file. The underwriter decides.", { x: 0.9, y: 4.4, w: 11.5, h: 0.6, fontSize: 22, bold: true, color: C.accent1 });
  txt(s, "Team briefing and demo. Runs locally on synthetic data. No real borrower data, no real lender system, nothing deployed.", { x: 0.9, y: 6.3, w: 11.5, h: 0.6, fontSize: 14, color: C.accent5 });
  s.addNotes("Open with the one rule that shapes everything: the software prepares, a human decides. Everything today is synthetic data on a local machine.");
}

// 2. Problem
{
  const s = light("The problem: preparation crowds out judgment", "Underwriters spend much of a file's time before the judgment call: reading documents, keying figures, cross-checking, applying rules, drafting the memo. This is a hypothesis about where time goes; we have not measured it on real files.");
  const items = [["Read", "Tax returns, bank statements, financials, ownership, the request"], ["Key and cross-check", "Do statements add up? Are they recent? Do owners total 100 percent?"], ["Apply the rules", "SBA SOP 50 10 requirements, one by one"], ["Write the memo", "Every figure traced back to a document"]];
  items.forEach(([h, d], i) => {
    const y = 1.6 + i * 1.15;
    card(s, 0.6, y, 7.2, 1.0, "step card " + (i + 1));
    s.addShape(pres.ShapeType.ellipse, { x: 0.8, y: y + 0.2, w: 0.6, h: 0.6, fill: { color: C.accent1 }, line: { color: C.accent1, width: 0 }, objectName: "step number " + (i + 1) });
    txt(s, String(i + 1), { x: 0.8, y: y + 0.2, w: 0.6, h: 0.6, fontSize: 20, bold: true, color: C.background1, align: "center", valign: "middle" });
    txt(s, h, { x: 1.65, y: y + 0.12, w: 6, h: 0.36, fontSize: 18, bold: true, color: C.text2 });
    txt(s, d, { x: 1.65, y: y + 0.5, w: 6, h: 0.4, fontSize: 14 });
  });
  card(s, 8.3, 1.6, 4.4, 4.45, "hypothesis card");
  txt(s, "Hypothesis", { x: 8.6, y: 1.85, w: 3.8, h: 0.4, fontSize: 20, bold: true, color: C.accent2 });
  txt(s, "If the file arrives prepared, with every figure linked to its source and problems flagged, underwriters spend less time per file and miss fewer problems.", { x: 8.6, y: 2.4, w: 3.8, h: 2.0, fontSize: 16 });
  txt(s, "Unproven until measured on real files.", { x: 8.6, y: 4.7, w: 3.8, h: 0.9, fontSize: 16, bold: true, color: C.accent4 });
}

// 3. What we are building
{
  const s = light("What we are building", "One sentence: software that prepares a commercial loan file, with sources attached, and hands it to a human underwriter. The decision gate is enforced in the database.");
  const flow = [["Application", "Structured intake; tax ID encrypted"], ["Documents", "Checked, scanned, facts read with page and quote"], ["Rules", "11 SBA SOP 50 10 rules plus consistency checks"], ["Exceptions and memo", "Problems flagged; cited memo drafted"], ["Underwriter decides", "Only a human can record it"]];
  flow.forEach(([h, d], i) => {
    const x = 0.6 + i * 2.45, last = i === 4;
    s.addShape(pres.ShapeType.roundRect, { x, y: 1.7, w: 2.25, h: 2.3, rectRadius: 0.08, fill: { color: last ? C.text2 : C.background2 }, line: { color: last ? C.text2 : C.background2, width: 0 }, objectName: "flow card " + (i + 1) });
    txt(s, h, { x: x + 0.15, y: 1.85, w: 1.95, h: 0.7, fontSize: 18, bold: true, color: last ? C.background1 : C.text2 });
    txt(s, d, { x: x + 0.15, y: 2.6, w: 1.95, h: 1.3, fontSize: 14, color: last ? C.background2 : C.text1 });
  });
  const pts = [["AI extracts and drafts", "Calculations and rules are tested code, not model output."], ["A human decides", "The software never approves, declines or ranks a borrower."], ["Everything is cited and audited", "No fact without a page and quote. Append-only, hash-chained log."]];
  pts.forEach(([h, d], i) => {
    const x = 0.6 + i * 4.1;
    txt(s, h, { x, y: 4.5, w: 3.8, h: 0.4, fontSize: 18, bold: true, color: C.accent1 });
    txt(s, d, { x, y: 4.95, w: 3.8, h: 1.2, fontSize: 16 });
  });
}

// 4. Roles
{
  const s = light("Who uses it", "Roles live in our database, not in the sign-in provider, so a provider cannot grant itself underwriter rights. The processor who tries to decide is refused; the viewer sees no decision form.");
  const roles = [["Processor", "Enters the application, uploads documents, builds the file", "Cannot record a decision"], ["Underwriter", "Reviews the file, checks facts against sources, disposes exceptions, decides", "Cannot administer users"], ["Viewer", "Reads files", "Cannot change anything"], ["Admin", "Users, roles, sessions, security events, the lender's own sign-in setup", "Cannot record a decision"]];
  roles.forEach(([h, can, cannot], i) => {
    const x = 0.6 + i * 3.08;
    card(s, x, 1.6, 2.9, 4.6, "role card " + h);
    txt(s, h, { x: x + 0.2, y: 1.8, w: 2.5, h: 0.5, fontSize: 22, bold: true, color: C.text2, fontFace: "Cambria" });
    txt(s, "Can", { x: x + 0.2, y: 2.5, w: 2.5, h: 0.3, fontSize: 14, bold: true, color: C.accent1 });
    txt(s, can, { x: x + 0.2, y: 2.85, w: 2.5, h: 1.6, fontSize: 15 });
    txt(s, "Cannot", { x: x + 0.2, y: 4.7, w: 2.5, h: 0.3, fontSize: 14, bold: true, color: C.accent4 });
    txt(s, cannot, { x: x + 0.2, y: 5.05, w: 2.5, h: 0.9, fontSize: 15 });
  });
}

// 5. Live: upload and build
{
  const s = light("Live: documents in, file built", "A processor uploads the packet through the case page. Each file is checked for type, content and malware before it is kept; if the scanner is unreachable, the upload is refused. One click builds the file: rules run, memo drafted and verified, nothing approved.");
  pic(s, "04-documents-uploaded", 0.6, 1.5, 5.95, "The processor uploads the packet. Each file is checked for type, content and malware before it is kept.");
  pic(s, "05-file-built", 6.78, 1.5, 5.95, "One click runs the rules and drafts the memo. The message states that nothing is approved.");
}

// 6. Live: the underwriter's file
{
  const s = light("Live: the underwriter's file", "Memo, rule results and facts on one page. Each figure links to its source passage. The memo cannot contain approve or decline language. The banner says accepted means faithfully extracted, not verified true.");
  s.addImage({ path: shot("08-clean-file-memo"), x: 0.6, y: 1.5, w: 7.6, h: 4.75, objectName: "screenshot file and memo", altText: "The underwriter's file with memo and cited facts" });
  const pts = [["Cited", "Every fact carries document, page and the quoted passage."], ["Checked", "Memo numbers are verified against their cited source."], ["Honest", "The tool lists what it did not evaluate."]];
  pts.forEach(([h, d], i) => {
    const y = 1.5 + i * 1.6;
    card(s, 8.5, y, 4.23, 1.4, "point " + h);
    txt(s, h, { x: 8.7, y: y + 0.15, w: 3.8, h: 0.4, fontSize: 18, bold: true, color: C.accent1 });
    txt(s, d, { x: 8.7, y: y + 0.6, w: 3.8, h: 0.7, fontSize: 15 });
  });
}

// 7. Live: problems caught
{
  const s = light("Live: problems are caught", "Two planted problems. In the first file the bank statements do not add up and the rules raise a high-severity exception. In the second, a document contains instruction-like text: it is treated as data, flagged critical, and the facts from that document are held for review.");
  pic(s, "10-arith-file-exceptions", 0.6, 1.5, 5.95, "Statements that do not add up raise a high-severity exception.");
  pic(s, "12-injection-file", 6.78, 1.5, 5.95, "A document tried to instruct the system. It was treated as data, flagged critical, and its facts held for a human.");
}

// 8. Live: human gate
{
  const s = light("Live: the human gate", "The database refuses an approval past an open critical or high exception without a written override, so a bug or another screen cannot bypass it. With an override, the decision is recorded with who, when, policy version and the reason.");
  pic(s, "11-arith-file-refused", 0.6, 1.5, 5.95, "Approve past an open high exception with no override: refused, by the database.");
  pic(s, "13-injection-file-approved", 6.78, 1.5, 5.95, "With a written override from an underwriter: recorded with the reason.");
}

// 9. Live: after decisions + admin
{
  const s = light("Live: after the decisions, and admin", "Two files handed off to the mock lender servicing adapter; one declined. There is no real bank integration. The admin screen manages users, roles and sessions; an admin cannot demote or disable themselves.");
  pic(s, "14-queue-after-decisions", 0.6, 1.5, 5.95, "Two files handed off to the mock servicing adapter, one declined.");
  pic(s, "16-admin-users", 6.78, 1.5, 5.95, "Admin: users, roles and sessions. Every change is audited.");
}

// 10. How it is built
{
  const s = light("How it is built to be trusted", "These are design properties each backed by tests. Row-level security means each query is restricted by the database to one lender's rows; the app's database role cannot bypass it.");
  const cards = [["Lender isolation", "Forced row-level security on every table. The app role is not an owner and cannot bypass it."], ["Human-only decisions", "Enforced by database rules, not only screens. Decisions are append-only."], ["Evidence", "No fact without a page and quote. Model confidence never decides acceptance."], ["Safe documents", "Name must match content; markup and active PDFs refused; malware scan fails closed."], ["Sign-in and access", "OpenID Connect, four roles, revocable sessions, every change audited."], ["Audit", "Hash-chained, append-only ledger the database can verify."]];
  cards.forEach(([h, d], i) => {
    const x = 0.6 + (i % 3) * 4.1, y = 1.6 + Math.floor(i / 3) * 2.55;
    card(s, x, y, 3.9, 2.35, "control card " + h);
    txt(s, h, { x: x + 0.2, y: y + 0.18, w: 3.5, h: 0.4, fontSize: 18, bold: true, color: C.text2 });
    txt(s, d, { x: x + 0.2, y: y + 0.7, w: 3.5, h: 1.5, fontSize: 15 });
  });
}

// 11. Evidence
{
  const s = light("What we have measured", "All of this is on synthetic data with a stand-in model that reads printed labels. It tests our checking layers, not a language model on real documents. The 87.8 percent accepted-and-correct and 0 false accepts come from 120 packets, 12 file types, 4,030 fields.");
  const stats = [["454", "automated tests pass, including real-database tests"], ["40 of 40", "browser walkthrough steps pass: four roles, three files"], ["102", "facts in the run, every one with a source passage"], ["0", "falsely accepted fields in 4,030 (synthetic, stand-in model)"]];
  stats.forEach(([big, d], i) => {
    const x = 0.6 + i * 3.08;
    card(s, x, 1.6, 2.9, 2.9, "stat card " + (i + 1));
    txt(s, big, { x: x + 0.2, y: 1.85, w: 2.5, h: 1.0, fontSize: 44, bold: true, fontFace: "Cambria", color: C.accent1 });
    txt(s, d, { x: x + 0.2, y: 3.0, w: 2.5, h: 1.4, fontSize: 15 });
  });
  txt(s, "Also measured: 87.8 percent of fields accepted and correct, 8.4 percent not extracted (image-only files, no OCR). Every planted problem class was caught in 100 percent of packets; two classes also over-flagged.", { x: 0.6, y: 4.85, w: 12.1, h: 0.8, fontSize: 16 });
  txt(s, "Labels: measured on synthetic data. Not measured: accuracy on real documents, time saved.", { x: 0.6, y: 5.8, w: 12.1, h: 0.5, fontSize: 16, bold: true, color: C.accent4 });
}

// 12. Standards charts
{
  const s = light("Our own reading of the security and AI standards", "Self-assessments with evidence cited in the repository, not certifications. ASVS 5.0.0 levels 1 and 2: 253 requirements. NIST AI RMF: 72 subcategories. A third-party penetration test, SOC 2 and lender vendor review are not done.");
  const base = { catGridLine: { style: "none" }, valGridLine: { color: "D5DCE4", size: 0.5 }, showValue: true, dataLabelPosition: "outEnd", dataLabelColor: "17212B", dataLabelFontSize: 12, dataLabelFontFace: "+mn-lt", catAxisLabelColor: "17212B", valAxisLabelColor: "5E6B78", catAxisLabelFontSize: 12, valAxisLabelFontSize: 11, catAxisLabelFontFace: "+mn-lt", valAxisLabelFontFace: "+mn-lt", showLegend: false, showTitle: true, titleFontSize: 16, titleColor: "0F2540", titleFontFace: "+mj-lt", barDir: "bar", valAxisHidden: true, catAxisOrientation: "maxMin" };
  s.addChart(pres.charts.BAR, [{ name: "Requirements", labels: ["Met", "Partial", "Deferred", "Not applicable", "Not met", "Not assessed"], values: [108, 40, 41, 62, 1, 1] }], Object.assign({ x: 0.6, y: 1.5, w: 6.0, h: 4.4, title: "OWASP ASVS 5.0.0, levels 1 and 2 (253)", chartColors: ["1B998B"] }, base));
  s.addChart(pres.charts.BAR, [{ name: "Subcategories", labels: ["Addressed", "Partial", "Gap", "Not applicable"], values: [9, 40, 22, 1] }], Object.assign({ x: 6.8, y: 1.5, w: 5.9, h: 4.4, title: "NIST AI RMF (72 subcategories)", chartColors: ["3D6FB6"] }, base));
  txt(s, "Self-assessed. 72 percent of the 150 applicable ASVS requirements are met. The gaps are listed in the repository with owners.", { x: 0.6, y: 6.1, w: 12.1, h: 0.6, fontSize: 15 });
}

// 13. Not yet
{
  const s = light("What it does not do yet", "Be upfront about these before anyone finds them. The rule pack prints its own coverage gaps with every file run.");
  const left = ["No real model provider or OCR; a stand-in model reads printed labels", "No real documents or lenders have been tested", "No identity provider chosen; sign-in tested with a stand-in", "Not deployed; hosting is undecided"];
  const right = ["Not evaluated: eligibility, collateral, tax transcripts, personal financial statements, credit reports, global cash flow", "Debt service uses only the new loan and a placeholder 9 percent rate", "504 and SBA Express are not encoded", "No third-party security test, SOC 2, vendor review or counsel review"];
  [left, right].forEach((arr, c) => {
    const x = 0.6 + c * 6.2;
    card(s, x, 1.6, 5.9, 4.4, "gaps card " + (c + 1));
    s.addText(arr.map((t, i) => ({ text: t, options: { bullet: true, breakLine: i < arr.length - 1, paraSpaceAfter: 16 } })), { x: x + 0.25, y: 1.85, w: 5.4, h: 4.0, fontSize: 18, fontFace: "Calibri", color: C.text1, valign: "top", margin: 0, isTextBox: true });
  });
}

// 14. Competitive honesty
{
  const s = light("How we compare, honestly", "Sources in docs/COMPETITIVE_SCAN.md and docs/BENCHMARK.md. Vendor statements are their public claims. No head-to-head test has been run, so we make no claim to outperform anyone.");
  const hdr = (t) => ({ text: t, options: { bold: true, color: "FFFFFF", fill: { color: "0F2540" }, fontSize: 14 } });
  const row = (a, b, c, behind) => [{ text: a, options: { bold: true } }, { text: b }, { text: c, options: { bold: true, color: behind ? "C0463B" : "1B998B" } }];
  s.addTable([
    [hdr("Capability"), hdr("Leading products (public claims)"), hdr("This tool today")],
    row("Scale, integrations, SBA forms and E-Tran", "Yes (nCino, Abrigo, Baker Hill)", "Behind: none", true),
    row("SOC 2 Type 2, ISO 27001, penetration test", "Listed by several vendors", "Behind: none yet", true),
    row("Fact-level citations, checked memo numbers", "Described as sourced; method not described", "Built and tested", false),
    row("Human decision enforced by the database", "Not described on pages read", "Built and tested", false),
    row("Accuracy published with its failures", "Claims without method", "Published, but synthetic only", false),
  ], { x: 0.6, y: 1.6, w: 12.1, colW: [4.2, 4.6, 3.3], fontSize: 14, fontFace: "Calibri", color: "17212B", border: { type: "solid", color: "D5DCE4", pt: 0.75 }, fill: { color: "FFFFFF" }, margin: [6, 8, 6, 8], valign: "middle", rowH: 0.7 });
  txt(s, "No head-to-head test has been run. We will pre-register targets, test on the same files, and publish the result either way.", { x: 0.6, y: 6.0, w: 12.1, h: 0.6, fontSize: 16, bold: true });
}

// 15. Plan
{
  const s = light("The next 90 days", "Stop conditions: a figure reaches a decision unflagged and wrong; the tool does not beat the measured baseline; a vendor or regulatory requirement cannot be met. Model calls need approval after reviewing the provider's data terms.");
  const cols = [["Days 1 to 30", "Learn and baseline", ["Lender and processor conversations", "Timed manual baseline with two underwriters", "Choose identity provider", "Decide hosting"], "Gate: requirements and a measured baseline"], ["Days 31 to 60", "Make it real", ["One real model provider, after reviewing its data terms", "OCR for scans and images", "Rerun the evaluation, publish failures"], "Gate: go or no-go"], ["Days 61 to 90", "Pilot", ["Partner's policy inputs and debt schedule", "External penetration test; counsel review", "Redacted, consented files; time both flows"], "Gate: measured comparison; continue or stop"]];
  cols.forEach(([d, h, items, gate], i) => {
    const x = 0.6 + i * 4.1;
    card(s, x, 1.6, 3.9, 4.7, "phase card " + (i + 1));
    txt(s, d, { x: x + 0.25, y: 1.8, w: 3.4, h: 0.35, fontSize: 14, bold: true, color: C.accent1 });
    txt(s, h, { x: x + 0.25, y: 2.15, w: 3.4, h: 0.5, fontSize: 22, bold: true, color: C.text2, fontFace: "Cambria" });
    s.addText(items.map((t, k) => ({ text: t, options: { bullet: true, breakLine: k < items.length - 1, paraSpaceAfter: 8 } })), { x: x + 0.25, y: 2.8, w: 3.4, h: 2.4, fontSize: 15, fontFace: "Calibri", color: C.text1, valign: "top", margin: 0, isTextBox: true });
    txt(s, gate, { x: x + 0.25, y: 5.4, w: 3.4, h: 0.7, fontSize: 14, bold: true, color: C.text2 });
  });
}

// 16. Decisions
{
  const s = light("Decisions we need from the team", "Hosting: the recommendation is AWS containers for a pilot with real lender data; Vercel is for testing with synthetic data only. This is a recommendation, not a decision. The reasons are in docs/HOSTING_OPTIONS.md.");
  const q = ["Which lending lines and volumes first, and what outcome defines success?", "Who can arrange lender conversations and two underwriters for the timed baseline?", "Hosting for a pilot (we recommend AWS containers; Vercel for testing only) and who approves vendor risk?", "Which model provider to evaluate, and approval for external calls with synthetic data first?", "Which identity provider?", "Who reviews the rules against SOP 50 10 and the list for counsel?"];
  q.forEach((t, i) => {
    const x = 0.6 + (i % 2) * 6.15, y = 1.6 + Math.floor(i / 2) * 1.6;
    card(s, x, y, 5.95, 1.4, "question card " + (i + 1));
    s.addShape(pres.ShapeType.ellipse, { x: x + 0.2, y: y + 0.4, w: 0.6, h: 0.6, fill: { color: C.text2 }, line: { color: C.text2, width: 0 }, objectName: "question number " + (i + 1) });
    txt(s, String(i + 1), { x: x + 0.2, y: y + 0.4, w: 0.6, h: 0.6, fontSize: 20, bold: true, color: C.background1, align: "center", valign: "middle" });
    txt(s, t, { x: x + 1.0, y: y + 0.15, w: 4.8, h: 1.1, fontSize: 16, valign: "middle" });
  });
}

// 17. Demo agenda
{
  const s = light("Demo plan: 15 minutes", "Say first: all data is synthetic, the model is a stand-in, the tool prepares files and a human decides. Mention the rough edges before they are noticed: coverage ratios look high because synthetic financials are generous; debt service uses a placeholder rate; the sign-in provider is a local stand-in.");
  const hdr = (t) => ({ text: t, options: { bold: true, color: "FFFFFF", fill: { color: "0F2540" }, fontSize: 14 } });
  const rows = [["1", "Sign in as Underwriter", "Roles come from our database; sessions revocable; sign-ins audited"], ["1", "Open the queue", "Every file is needs review; the software never approves"], ["2", "Open a flagged file", "Instruction-like text held for a human, not obeyed"], ["3", "Rules, facts, memo", "11 SBA rules with SOP sections; every fact cited; memo numbers checked"], ["2", "Try Approve, then add an override", "Refused first, recorded with a written reason; enforced by the database"], ["1", "Audit trail and handoff", "Append-only, hash-chained; only the approved file reached the mock adapter"], ["3", "Processor: apply, upload, build", "Intake to prepared file in a few clicks; tax ID shows last four only"], ["1", "Admin screens", "Users, roles, sessions, security events"]];
  s.addTable([[hdr("Min"), hdr("Do"), hdr("Point to make")]].concat(rows.map((r) => r.map((t, i) => ({ text: t, options: { bold: i === 1 } })))), { x: 0.6, y: 1.5, w: 12.1, colW: [0.8, 3.8, 7.5], fontSize: 14, fontFace: "Calibri", color: "17212B", border: { type: "solid", color: "D5DCE4", pt: 0.75 }, fill: { color: "FFFFFF" }, margin: [4, 8, 4, 8], valign: "middle", rowH: 0.52 });
}

// 18. Close
{
  const s = pres.addSlide({ masterName: "DARK" });
  txt(s, "The tool prepares the file.", { x: 0.9, y: 2.3, w: 11.5, h: 0.9, fontSize: 40, bold: true, fontFace: "Cambria", color: C.background1 });
  txt(s, "The underwriter decides.", { x: 0.9, y: 3.2, w: 11.5, h: 0.9, fontSize: 40, bold: true, fontFace: "Cambria", color: C.accent1 });
  txt(s, "Reference: workspace/docs/TEAM_GUIDE.md. Demo: demo/walkthrough/WALKTHROUGH.html. Nothing here is legal advice.", { x: 0.9, y: 5.2, w: 11.5, h: 0.6, fontSize: 16, color: C.background2 });
  s.addNotes("Close on the principle, then take questions. Point to the team guide for the full reference.");
}

(async () => {
  const out = path.join(__dirname, "Underwriting_Copilot_Team_Deck.pptx");
  await pres.writeFile({ fileName: out });
  await applyTheme(out, THEME);
  console.log("wrote", out);
})();
