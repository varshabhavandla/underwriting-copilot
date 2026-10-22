"""Builds deck.html (single file, screenshots embedded) from the slide list below. Run: python3 build_deck.py"""
import base64, pathlib
here = pathlib.Path(__file__).parent
def img(n):
    return "data:image/png;base64," + base64.b64encode((here / "walkthrough" / n).read_bytes()).decode()

S = []
def slide(html): S.append(html)

slide("""<h1>AI-assisted loan file preparation</h1><p class=sub>SBA 7(a) first. A working application, shown on synthetic data.</p>
<p class=tag>The tool prepares the file. The underwriter decides.</p><p class=small>Status: runs locally. No real borrower data, no real lender system, nothing deployed.</p>""")

slide("""<h2>The problem</h2><ul>
<li>Commercial loan files are document-heavy: read statements, key figures, cross-check them, apply program rules, write the memo.</li>
<li>That work sits before the judgment call, and the judgment call is what experienced underwriters are for.</li>
<li>Hypothesis: prepare the file with sources attached, so underwriters spend their time deciding. <b>Unproven until measured on real files.</b></li></ul>""")

slide("""<h2>What it does</h2><div class=flow><div>Application<br><small>structured intake, tax ID encrypted</small></div><div>Documents<br><small>checked, scanned, facts read with page and quote</small></div><div>Checks<br><small>11 SBA SOP rules, consistency checks</small></div><div>Exceptions + memo<br><small>cited, numbers verified</small></div><div class=gate>Underwriter decides<br><small>only a human can record it</small></div></div>
<p class=small>Rules are tested code, not model output. Anything unknown or failing goes to a person. Approved files hand off to a mock lender servicing adapter.</p>""")

slide("""<h2>Who uses it</h2><table><tr><th>Role</th><th>Can do</th><th>Cannot do</th></tr>
<tr><td>Processor</td><td>Apply, upload documents, build the file</td><td>Record a decision (refused)</td></tr>
<tr><td>Underwriter</td><td>Review, dispose exceptions, adopt memo, decide</td><td>Administer users</td></tr>
<tr><td>Viewer</td><td>Read files</td><td>Change anything; sees no decision form</td></tr>
<tr><td>Admin</td><td>Users, roles, sessions, security events, per-lender sign-in setup</td><td>Record a decision</td></tr></table>
<p class=small>Sign-in uses OpenID Connect through the lender's own identity provider. Each lender's data is separated by the database.</p>""")

slide(f"""<h2>Live: documents in, file built</h2><div class=two><div><img src="{img('04-documents-uploaded.png')}"><p class=cap>A processor uploads the packet. Each file is checked for type, content and malware before it is kept.</p></div><div><img src="{img('05-file-built.png')}"><p class=cap>One click runs the rules and drafts the memo. The message says nothing is approved.</p></div></div>""")
slide(f"""<h2>Live: the underwriter's file</h2><img src="{img('08-clean-file-memo.png')}"><p class=cap>Cited memo, rule results and facts on one page. Every number links to its source passage; the memo cannot say approve or decline.</p>""")
slide(f"""<h2>Live: problems are caught</h2><div class=two><div><img src="{img('10-arith-file-exceptions.png')}"><p class=cap>Bank statements that do not add up raise a high-severity exception.</p></div><div><img src="{img('12-injection-file.png')}"><p class=cap>A document tried to instruct the system. It was treated as data, flagged critical, and its facts held for a human.</p></div></div>""")
slide(f"""<h2>Live: the human gate</h2><div class=two><div><img src="{img('11-arith-file-refused.png')}"><p class=cap>Approve past an open high exception with no override: refused, by the database.</p></div><div><img src="{img('13-injection-file-approved.png')}"><p class=cap>With a written override by an underwriter: recorded with the reason.</p></div></div>""")
slide(f"""<h2>Live: after the decisions</h2><div class=two><div><img src="{img('14-queue-after-decisions.png')}"><p class=cap>Two files handed off to the mock lender adapter, one declined.</p></div><div><img src="{img('16-admin-users.png')}"><p class=cap>Admin screen: users, roles and sessions.</p></div></div>""")

slide("""<h2>What is proven so far</h2><table><tr><th>Check</th><th>Result</th><th>Label</th></tr>
<tr><td>Automated tests, including real-database tests</td><td>454 pass</td><td>Measured</td></tr>
<tr><td>Browser walkthrough: four roles, three files, every path above</td><td>40 of 40 steps pass; audit chain verifies; every one of 102 facts cited; tax ID and documents encrypted; no personal data in logs</td><td>Measured, synthetic data</td></tr>
<tr><td>120 synthetic packets, 12 file types, 4,030 fields</td><td>87.8% accepted and correct; 0 falsely accepted; 8.4% not extracted (scans, no OCR)</td><td>Measured, stand-in model</td></tr>
<tr><td>Planted problems detected</td><td>100% in every class; also over-flagged in two classes</td><td>Measured</td></tr>
<tr><td>Rule constants vs SBA SOP 50 10 8.1</td><td>Re-checked 2026-10-22</td><td>Verified</td></tr></table>
<p class=small>The stand-in model reads printed labels. These results test the checking layers, not a language model on real documents.</p>""")

slide("""<h2>Security and governance, assessed by us</h2><table><tr><th>Standard</th><th>Our self-assessment</th><th>Label</th></tr>
<tr><td>OWASP ASVS 5.0.0, levels 1 and 2 (253 requirements)</td><td>108 met, 40 partial, 1 not met, 41 deferred, 62 not applicable, 1 not assessed. 72% of the 150 that apply are met.</td><td>Self-assessed, evidence cited</td></tr>
<tr><td>NIST AI RMF (72 subcategories)</td><td>9 addressed, 40 partial, 22 gaps, 1 not applicable</td><td>Self-assessed</td></tr>
<tr><td>Third-party penetration test, SOC 2, lender vendor review</td><td>None yet</td><td>Not done</td></tr></table>
<p class=small>These are our own readings of the standards, not certifications. The gaps are listed in the repository with owners.</p>""")

slide("""<h2>Controls built in</h2><ul>
<li><b>Human decides:</b> enforced in the database; only an underwriter acting as themselves can record a decision.</li>
<li><b>Evidence:</b> no fact without a page and quote; accepted means faithfully extracted, not verified true.</li>
<li><b>Isolation:</b> per-lender data separation enforced by the database; append-only, hash-chained audit log.</li>
<li><b>Safety:</b> identifiers encrypted and redacted before any model call; document text is never treated as instructions.</li>
<li><b>Access:</b> OpenID Connect sign-in, four roles, revocable sessions, every sign-in and admin change audited.</li>
<li><b>Hardening:</b> upload checks with fail-closed malware scan, rate limits, scrubbed logs, security headers, threat model mapped to tests.</li></ul>""")

slide("""<h2>How we compare, honestly</h2><table><tr><th></th><th>Leading products (public claims)</th><th>This tool today</th></tr>
<tr><td>Scale, integrations, SBA forms and E-Tran</td><td>Yes (nCino, Abrigo, Baker Hill)</td><td><b>Behind</b>: none</td></tr>
<tr><td>SOC 2 Type 2 / ISO 27001 / pen test</td><td>Listed (Abrigo, Ocrolus)</td><td><b>Behind</b>: none yet</td></tr>
<tr><td>Fact-level citations and checked memo numbers</td><td>"Clearly sourced" (Moody's); method not described</td><td><b>Built and tested</b></td></tr>
<tr><td>Human decision enforced by the database</td><td>Not described on pages read</td><td><b>Built and tested</b></td></tr>
<tr><td>Published accuracy including failures</td><td>Claims without method (e.g. "over 99%")</td><td><b>Published</b>, but synthetic data only</td></tr></table>
<p class=small>No head-to-head test has been run, so we make no claim to outperform anyone. We will pre-register targets and test on the same files, then publish the result either way.</p>""")

slide("""<h2>What it might be worth</h2><p class=warn>ESTIMATE ONLY. Durations are our guesses, not measurements.</p>
<ul><li>Modeled assisted-to-manual time ratio: 0.19 to 0.50 at middle assumptions.</li><li>At pessimistic assumptions the ratio exceeds 1.0 (no saving).</li><li>We make no savings claim. The first 30 days measure the real manual baseline with two of your underwriters.</li></ul>""")

slide("""<h2>Where it would run</h2><ul>
<li><b>Testing now:</b> a hosted test deployment is prepared (Vercel with a hosted database) for non-sensitive synthetic testing only.</li>
<li><b>Pilot with real lender data:</b> we recommend AWS containers, because the database must enforce lender separation, the malware scanner must run as a service, and the lender will ask where data lives. <b>This is a recommendation; the decision is yours and your lender's.</b></li>
<li>Finding that shaped this: some hosted databases give default roles the ability to bypass row-level separation, and some connection poolers may break per-request lender settings. We test for both before any use.</li></ul>""")

slide("""<h2>What it is not yet</h2><ul>
<li>No real model, OCR, identity provider or hosting; no real documents tested. Sign-in is built to the OpenID Connect standard and tested with a stand-in provider.</li>
<li>Debt service covers the new loan only, with a placeholder rate; eligibility, collateral and credit reports are not evaluated.</li>
<li>No third-party security test, no lender vendor-risk review, and items awaiting counsel and compliance review. This is not legal advice.</li></ul>""")

slide("""<h2>90-day plan and what we need from you</h2><table><tr><th>Days</th><th>Work</th><th>Gate</th></tr>
<tr><td>1-30</td><td>Confirm requirements; timed manual baseline with two underwriters; choose the identity provider (sign-in is built)</td><td>Requirements and a measured baseline</td></tr>
<tr><td>31-60</td><td>With approval: one real model provider, OCR; real accuracy report including failures</td><td>Go / no-go</td></tr>
<tr><td>61-90</td><td>Pilot on redacted, consented files with your policy; both flows timed; security test and counsel review</td><td>Measured comparison; continue or stop</td></tr></table>
<p class=small>Stop if a figure reaches a decision unflagged and wrong, if it does not beat the baseline, or if a vendor or regulatory requirement cannot be met.</p>""")

slide("""<h2>Your requirements: what would make this a yes?</h2><ol>
<li>Which lending lines and volumes first? What outcome defines success, and by when?</li>
<li>Where do files and decisions live today; what integration is mandatory?</li>
<li>Your credit policy overlays and pricing inputs.</li>
<li>Vendor, cloud, data-residency and model-provider requirements; who approves vendor risk?</li>
<li>Governance and examiner expectations; budget range; pilot sponsor and underwriters.</li></ol>""")

css = """:root{--bg:#0f141a;--fg:#e8edf3;--mu:#9aa7b6;--ac:#6c94ff;--cd:#171e27;--ln:#2b3542;--w:#ffb74d}
@media print{:root{--bg:#fff;--fg:#16202c;--mu:#5b6776;--ac:#1f5eff;--cd:#f6f8fa;--ln:#dfe4ea;--w:#b54708}.s{page-break-after:always}}
*{box-sizing:border-box}body{margin:0;background:var(--bg);color:var(--fg);font:20px/1.45 system-ui,-apple-system,Segoe UI,sans-serif}
.s{min-height:100vh;padding:5vh 7vw;display:none}.s.on{display:block}@media print{.s{display:block}}
h1{font-size:46px;margin:12vh 0 8px}h2{font-size:32px;margin:0 0 20px}.sub{font-size:24px;color:var(--mu)}.tag{font-size:28px;color:var(--ac);margin-top:30px}
.small{color:var(--mu);font-size:16px}.cap{color:var(--mu);font-size:16px;margin:8px 0 0}.warn{color:var(--w);font-weight:700}
img{max-width:100%;max-height:62vh;border:1px solid var(--ln);border-radius:8px}.two{display:grid;grid-template-columns:1fr 1fr;gap:16px}.two img{max-height:48vh}
ul,ol{padding-left:24px}li{margin:10px 0}table{border-collapse:collapse;width:100%;font-size:17px}th,td{border-bottom:1px solid var(--ln);padding:8px 10px;text-align:left;vertical-align:top}th{color:var(--mu)}
.flow{display:grid;grid-template-columns:repeat(5,1fr);gap:10px}.flow div{background:var(--cd);border:1px solid var(--ln);border-radius:8px;padding:12px;font-weight:600}.flow small{color:var(--mu);font-weight:400;font-size:14px}.flow .gate{border-color:var(--ac)}
.nav{position:fixed;right:16px;bottom:10px;color:var(--mu);font-size:13px}@media print{.nav{display:none}}"""
js = """const s=[...document.querySelectorAll('.s')];let i=0;const n=document.querySelector('.nav');
function show(k){i=Math.max(0,Math.min(s.length-1,k));s.forEach((e,j)=>e.classList.toggle('on',j===i));n.textContent=(i+1)+' / '+s.length+'  (arrow keys)';location.hash=i+1}
addEventListener('keydown',e=>{if(['ArrowRight','PageDown',' '].includes(e.key))show(i+1);if(['ArrowLeft','PageUp'].includes(e.key))show(i-1)});
addEventListener('click',e=>{if(e.clientX>innerWidth/2)show(i+1);else show(i-1)});show((parseInt(location.hash.slice(1))||1)-1)"""
body = "\n".join(f'<section class="s">{x}</section>' for x in S)
(here / "deck.html").write_text(f'<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Loan file preparation: demo and plan</title><style>{css}</style></head><body>{body}<div class="nav"></div><script>{js}</script></body></html>')
print(len(S), "slides")
