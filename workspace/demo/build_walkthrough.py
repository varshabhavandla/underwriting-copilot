"""Builds walkthrough/WALKTHROUGH.html: a step-by-step narrated page from the screenshots and REPORT.md that `npm run walkthrough` writes.
Run from this folder: python3 build_walkthrough.py"""
import base64, html, json, re
W = "walkthrough/"
rep = open(W + "REPORT.md").read()
checks = {int(n): s for n, s, r in re.findall(r"^\| (\d+) \| (.+?) \| (pass|FAIL)", rep, re.M)}
run = re.search(r"Run (\S+)", rep).group(1)
# (image, who, title, narration, check numbers)
S = [
 (None, "Overview", "What you are about to see",
  ["A lender's underwriter normally spends most of a file's time collecting documents, keying numbers, checking rules and writing a memo.",
   "This application does that preparation. It reads documents, cites where every number came from, runs the rules, flags problems and drafts the memo. A human underwriter then decides. The software never approves or declines anything.",
   "Everything below was recorded from a real run of the app on a local stack with synthetic data. Use the arrow keys or the buttons."], []),
 ("01-underwriter-empty-queue", "Underwriter", "Sign in and open the queue",
  ["Four people sign in through an identity provider: processor, underwriter, viewer and admin. Each role sees and can do different things.",
   "The underwriter's queue is empty. The page states the rule that governs everything: the tool prepares files, only an underwriter decides."],
  [1, 2, 3, 4]),
 ("02-application-received", "Processor", "Submit an application",
  ["A processor enters the borrower and the request through a form.",
   "The tax ID is encrypted before it is stored. Only the last four digits (6789) are ever shown on screen."],
  [5, 37]),
 ("03-case-before-documents", "Processor", "Open the new case",
  ["The case exists but is empty. Nothing is extracted, checked or drafted yet."], []),
 ("04-documents-uploaded", "Processor", "Upload the document packet",
  ["Six synthetic documents go in: tax returns, bank statements and a financial statement.",
   "Each file is checked before it is kept: the name must match the content, markup and active PDFs are refused, and a malware scan must pass. If the scanner is unreachable the upload is refused, not waved through.",
   "Facts are read from the text, and each accepted fact keeps the passage it came from."],
  [6, 9, 12, 36]),
 ("05-file-built", "Processor", "Build the file",
  ["One click runs 11 rules, drafts a credit memo and verifies the memo's numbers against the facts.",
   "The result message says what it did and what it did not do: rules passed, items needing review, exceptions raised, and that nothing is approved."],
  [7, 10, 13, 35]),
 ("06-queue-three-files", "Underwriter", "Three files in the queue",
  ["Three synthetic packets were processed: a clean one, one with an arithmetic error planted in the bank statements, and one with an instruction hidden in a document.",
   "The queue shows open exceptions by severity so the underwriter knows where to look first."],
  [14]),
 ("07-clean-file-top", "Underwriter", "A file as the underwriter sees it",
  ["Request, documents, exceptions and status. The status is needs_review, and a banner reminds the reader that facts are extracted and not verified against the original."],
  [17]),
 ("08-clean-file-memo", "Underwriter", "Memo, rules and cited facts",
  ["The drafted memo, the rule results and every accepted fact are on one page. Each fact shows its source passage, so the underwriter can check it against the document instead of retyping it.",
   "The underwriter adopts the memo and disposes each open exception with a written note."],
  [18, 19, 20, 34]),
 ("09-clean-file-approved", "Underwriter", "Approve the clean file",
  ["Only an underwriter can record a decision. The decision stores who decided, which policy version applied and the reasons.",
   "A processor who tries gets a 403, and the viewer sees no decision form at all."],
  [21, 15, 16, 31]),
 ("10-arith-file-exceptions", "Underwriter", "A planted error is caught",
  ["In the second file the bank statements do not add up. The rules raise a high-severity exception and put it at the top for the underwriter."],
  [22]),
 ("11-arith-file-refused", "Underwriter", "The gate refuses an unsafe approval",
  ["Approving past an open high exception with no written override is refused. This rule is enforced in the database, so a bug or a different screen cannot bypass it.",
   "The underwriter declines the file with written reasons instead."],
  [23, 24]),
 ("12-injection-file", "Underwriter", "A hidden instruction is treated as data",
  ["The third file contains text trying to instruct the system. It is never obeyed. It is flagged critical and the facts from that document are held for review."],
  [25]),
 ("13-injection-file-approved", "Underwriter", "Approval only with a written override",
  ["The underwriter can still approve, but only by recording an override that explains why. The override is stored with the decision and is the only one in the run."],
  [26, 32]),
 ("14-queue-after-decisions", "Underwriter", "After the decisions",
  ["Two files are handed off to the mock lender servicing adapter and one is declined. There is no real bank integration; the adapter is a stand-in behind a clean interface.",
   "Delivery sent three events and nothing failed."],
  [27, 28]),
 ("15-admin-security-events", "Admin", "Admin: security events",
  ["Administrators see sign-ins and other security events."], [29]),
 ("16-admin-users", "Admin", "Admin: users, roles and sessions",
  ["Administrators manage users and roles. Each person can also see their own sessions and end the others."], [30]),
 ("17-signed-out", "Any role", "Sign out",
  ["Signing out lands on a plain page. Protected pages then send the browser back to sign in."], [39, 40]),
 (None, "Evidence", "What the run proves behind the screens",
  ["After the clicking, the script checks the database directly:"], [33, 34, 36, 37, 38]),
 (None, "Limits", "What this does not prove",
  ["Synthetic data only. Nothing has been tried on real files or with real lenders.",
   "Extraction runs on a stand-in model, not an approved provider (B-124), so accuracy is not claimed.",
   "No measured time saving yet (B-131).",
   "Rules and SBA policy content need review by lender counsel; this is not legal advice.",
   "Nothing is deployed, and the hosting choice is open (B-157)."], []),
]
slides = []
for img, who, title, narr, nums in S:
    d = {"who": who, "title": title, "narr": narr, "checks": [f"{n}. {checks[n]}" for n in nums if n in checks]}
    if img: d["img"] = "data:image/png;base64," + base64.b64encode(open(W + img + ".png", "rb").read()).decode()
    slides.append(d)
page = """<!doctype html><meta charset=utf-8><meta name=viewport content="width=device-width,initial-scale=1"><title>Underwriting copilot walkthrough</title>
<style>:root{--bg:#f7f8fa;--fg:#18212b;--card:#fff;--line:#dde2e8;--mut:#5b6672;--acc:#1f5eff;--ok:#0a7a3d}
@media(prefers-color-scheme:dark){:root{--bg:#12161b;--fg:#e6eaee;--card:#1b2128;--line:#2c353f;--mut:#9aa5b1;--acc:#6e97ff;--ok:#4cc983}}
body{font:16px/1.55 system-ui,sans-serif;margin:0;background:var(--bg);color:var(--fg)}main{max-width:1080px;margin:0 auto;padding:16px}
.top{display:flex;justify-content:space-between;align-items:center;gap:8px;color:var(--mut);font-size:14px}.bar{height:4px;background:var(--line);border-radius:2px;margin:8px 0 16px}.bar i{display:block;height:4px;background:var(--acc);border-radius:2px}
.who{display:inline-block;font-size:13px;border:1px solid var(--line);border-radius:12px;padding:1px 10px;color:var(--mut)}h1{font-size:24px;margin:8px 0}
.grid{display:grid;grid-template-columns:minmax(0,1.6fr) minmax(0,1fr);gap:20px}@media(max-width:800px){.grid{grid-template-columns:1fr}}
.grid.one{grid-template-columns:1fr;max-width:720px}img{width:100%;border:1px solid var(--line);border-radius:8px;background:var(--card)}
.card{background:var(--card);border:1px solid var(--line);border-radius:10px;padding:4px 16px 12px}.checks{font-size:14px;color:var(--mut);margin-top:12px;padding-left:0;list-style:none}.checks li{padding:2px 0}.checks li:before{content:"pass ";color:var(--ok);font-weight:600}
nav{display:flex;gap:8px;margin-top:16px;justify-content:space-between}button{font:inherit;padding:8px 18px;border-radius:8px;border:1px solid var(--line);background:var(--card);color:var(--fg);cursor:pointer}button.p{background:var(--acc);border-color:var(--acc);color:#fff}button:disabled{opacity:.4;cursor:default}</style>
<main><div class=top><span>Synthetic data. A human underwriter makes every credit decision. Recorded @@RUN@@</span><span id=n></span></div><div class=bar><i id=b></i></div>
<div id=s></div><nav><button id=pv>Back</button><button id=nx class=p>Next</button></nav></main>
<script>const S=@@SLIDES@@;let i=0;const e=x=>document.getElementById(x),esc=t=>t.replace(/[&<>"]/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;"}[c]));
function show(){const d=S[i];e("n").textContent="Step "+(i+1)+" of "+S.length;e("b").style.width=((i+1)/S.length*100)+"%";
const text='<div class=card><p><span class=who>'+esc(d.who)+'</span></p><h1>'+esc(d.title)+'</h1>'+d.narr.map(t=>'<p>'+esc(t)+'</p>').join("")+(d.checks.length?'<ul class=checks>'+d.checks.map(c=>'<li>'+esc(c)+'</li>').join("")+'</ul>':"")+'</div>';
e("s").innerHTML=d.img?'<div class=grid><img alt="'+esc(d.title)+'" src="'+d.img+'">'+text+'</div>':'<div class="grid one">'+text+'</div>';e("pv").disabled=i==0;e("nx").disabled=i==S.length-1;scrollTo(0,0)}
e("pv").onclick=()=>{if(i>0){i--;show()}};e("nx").onclick=()=>{if(i<S.length-1){i++;show()}};
addEventListener("keydown",k=>{if(k.key=="ArrowRight"||k.key==" "){e("nx").click();k.preventDefault()}if(k.key=="ArrowLeft")e("pv").click()});show();</script>"""
open(W + "WALKTHROUGH.html", "w").write(page.replace("@@RUN@@", run).replace("@@SLIDES@@", json.dumps(slides)))
print(len(slides), "steps")
