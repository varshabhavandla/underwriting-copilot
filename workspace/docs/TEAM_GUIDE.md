# Underwriting copilot: team guide

Purpose of this document: explain to the team what we are building and why, what works today, what does not, and how to demo it. Written 2026-10-22. Claims are labeled **[measured]** (we ran it), **[verified]** (from a cited source in SOURCES.md), **[inferred]** (our reasoning), **[assumed]** (we have not checked) or **[not done]**. Nothing here is legal advice.

## 1. In one paragraph
We are building software that prepares commercial loan files, starting with SBA 7(a), so that an underwriter spends time on the credit decision instead of on collecting documents, keying numbers and writing the first draft of the memo. The software reads the application and documents, records where every number came from, runs the SBA rules, flags problems, and drafts a cited memo. **A human underwriter makes every credit decision. The software never approves, declines or ranks a borrower.** This is a hard design constraint, enforced in the database, not only on screen.

## 2. The problem
A small-business loan file is a stack of documents: tax returns, bank statements, financial statements, ownership details, the request. Before an underwriter can judge the credit, someone must read them, key the figures into a spreadsheet, cross-check them (do the statements add up? are they recent? do ownership percentages total 100?), apply the program's rules, and write the memo. That preparation sits before the judgment call and consumes much of the time. Errors in it are costly, and a missed document or a mistyped number can reach the decision unnoticed.

**Hypothesis [assumed]:** if the file arrives prepared, with every figure linked to its source and problems flagged, underwriters spend less time per file and miss fewer problems. **We have not measured this on real files.** Proving it is the main goal of the next phase (section 9).

## 3. What we are trying to accomplish
1. **A working tool a lender could pilot.** Intake through decision handoff, with an audit trail.
2. **Trust by design.** Human decides, every fact cited, lender data isolated, everything auditable, document text never obeyed as instructions.
3. **Evidence over claims.** We publish what we measured, including failures, label everything, and make no claim to outperform any vendor without a head-to-head test.
4. **A path to a pilot.** Know exactly what a lender will ask for (security evidence, vendor risk review, counsel review) and what we still owe them.

Not goals: automated credit decisions, borrower scoring or ranking, replacing underwriters, a loan origination system, or SBA form generation.

## 4. Who uses it
| Role | What they do | What they cannot do |
|---|---|---|
| Processor | Enter the application, upload documents, build the file | Record a decision (the request is refused) |
| Underwriter | Review the file, check facts against their sources, dispose exceptions, adopt or edit the memo, decide | Administer users |
| Viewer | Read files | Change anything; sees no decision form |
| Admin | Create users, set roles, link identities, view sessions and security events, configure the lender's own sign-in provider | Record a decision |

Roles are stored in our database, not taken from the sign-in provider, so a provider cannot grant itself underwriter rights.

## 5. How it works, step by step
1. **Intake.** A processor submits the application form. Business name, request (amount, term, use of proceeds), owners and their percentages. The tax ID (EIN) is encrypted with a per-lender key; only the last four digits are ever shown.
2. **Documents.** The processor uploads tax returns, bank statements and financial statements (PDF, PNG, JPEG, or plain text up to 4 MB). Before a file is kept, it is checked: the name must match the content, markup and active PDFs are refused, and a malware scan must pass. If the scanner cannot be reached, the upload is refused, not accepted. Documents are stored encrypted.
3. **Extraction with citations.** Facts (revenue, balances, dates) are read from the documents through a single model gateway. Each fact must carry a citation: document, page, quoted passage. A fact whose citation cannot be found in the source text is rejected. "Accepted" means faithfully extracted from the document, **not** verified true in the real world. Model-stated confidence never decides acceptance.
4. **Safety around documents.** Identifiers are redacted before any model call. Document text is data, never instructions: if a document contains instruction-like text, the tool flags it as a critical exception and holds that document's facts for a human.
5. **Rules.** Eleven deterministic rules for SBA SOP 50 10 version 8.1 run over accepted facts, each citing its SOP section (list in docs/RULE_PACK.md). A rule that cannot be evaluated never passes; it returns needs-review. Seven always apply; four are conditional.
   - Always: loan amount limit, guaranty percentage, ownership totals 100 percent, required documents present, financial statements within 120 days, debt service coverage (new loan only, indicative), maturity limit.
   - Conditional: start-up equity, refinance requirements, change of ownership, working-capital justification.
6. **Exceptions.** Problems become exceptions with a severity (critical, high, other): missing documents, statements that do not add up, stale documents, instruction-like text in documents.
7. **Memo draft.** A credit memo is drafted. Every line is cited and every number is checked against the cited source. The memo cannot contain approve or decline language. It lists the items the tool did not evaluate.
8. **Human decision.** The underwriter reads the file, adopts the memo, disposes each exception with a note, and records approve, decline or return. Database rules enforce:
   - only an underwriter can decide;
   - approving while a critical or high exception is open needs a written override explaining why;
   - a decided case is final;
   - decisions are append-only and record who, when, the policy version, reasons and any override.
9. **Handoff.** After an approval, a signed, retried outbox sends an event to a **mock** lender servicing adapter behind a clean interface. There is no real bank integration.
10. **Audit.** Every step is written to a hash-chained, append-only ledger. The database can verify that no past record was altered.

## 6. What it is built from
- **Stack:** TypeScript (strict), Node 22, Next.js 16 and React 19 for screens and API, PostgreSQL 16, Vitest for tests, zod for validation, jose for token checks.
- **Isolation [measured by tests]:** every table has a tenant id and forced row-level security. The application's database role is not an owner and has no bypass. Tenant and user are set per transaction. Decisions, audit events and memos are append-only.
- **Sign-in:** OpenID Connect (authorization code with PKCE, strict token validation), opaque server-side sessions (30 minutes idle, 12 hours absolute, revocable at once). A lender can have its own identity provider, configured by its admin, with the client secret stored encrypted and write-only.
- **Request hardening:** rate limits, JSON-only writes, scrubbed logs, security headers, safe outbound fetching (public addresses only, no redirects), production start-up guards that refuse unsafe settings.
- **Main tables:** tenants, users, cases, applications, documents, facts, exceptions, rule runs and results, memos and adoptions, decisions, audit events, outbox events, stored objects, and an auth schema (identities, sessions, per-tenant providers).
- **Screens:** `/apply`, `/review` (queue), `/review/<case>` (file, documents, memo, decision), `/admin` (users, SSO, security events), `/account` (own sessions), plus sign-in and signed-out pages.
- Architecture detail: docs/ARCHITECTURE.md. Threat model: docs/THREAT_MODEL.md.

## 7. Where we are
| Area | Status |
|---|---|
| Intake, upload, extraction, rules, exceptions, memo, decision gate, handoff, audit | Built and tested on synthetic data |
| Sign-in, roles, admin screens, per-lender sign-in | Built; tested with a stand-in identity provider only |
| Browser walkthrough of the whole workflow | 40 of 40 steps pass, in verify and CI [measured] |
| Automated tests | 454 pass, including real-database tests [measured] |
| Real model provider | **Not done.** A stand-in model that reads printed labels is used (B-124) |
| OCR for scans and images | **Not done.** Image-only files route to manual reading (B-125) |
| Real identity provider chosen | **Not done** (B-117) |
| Hosting | **Not decided.** Options compared in docs/HOSTING_OPTIONS.md; test deployment prepared (B-157, B-158) |
| Real lender conversations | **Not done** (B-116) |
| Third-party security test, SOC 2, lender vendor review | **Not done** |
| Counsel review of legal items | **Not done** (docs/LEGAL_REVIEW.md) |

## 8. Evidence so far
- **Extraction on synthetic packets [measured, stand-in model]:** 120 packets, 12 file types, 4,030 fields: 87.8% accepted and correct, **0 falsely accepted**, 3.7% held for a human, 8.4% not extracted (image-only files with no OCR). Because the model reads printed labels from the same templates, this tests the checking layers, not a language model on real paper.
- **Planted problems [measured]:** every planted problem class was caught in 100% of packets; two classes also over-flagged (reported, not hidden).
- **Rule constants [verified]:** re-checked against SOP 50 10 8.1 on 2026-10-22.
- **OWASP ASVS 5.0.0 levels 1 and 2 [self-assessed]:** 253 requirements: 108 met, 40 partial, 1 not met, 41 deferred, 62 not applicable, 1 not assessed; 72 percent of the 150 that apply are met (docs/ASVS_SELF_ASSESSMENT.md).
- **NIST AI RMF [self-assessed]:** 72 subcategories: 9 addressed, 40 partial, 22 gaps, 1 not applicable (docs/NIST_AI_RMF_MAPPING.md).
- **Time savings [not measured]:** the modeled ratio (0.19 to 0.50 at middle assumptions, above 1.0 at pessimistic ones) is a guess from assumed durations. Do not quote it as a result. A timed baseline with two underwriters (B-131) is how we get a real number.

## 9. What the software does not do yet
Eligibility screening (size standard, ineligible types, affiliation), IRS tax transcripts, personal financial statements and credit reports, collateral and appraisals, existing business debt and global cash flow, franchise and insurance items, the interest rate cap check. Debt service uses only the new loan and a placeholder 9 percent rate. The 504 program and SBA Express are not encoded. The full list is printed with every file run.

## 10. Context: competitors and our position [inferred, sources in docs/COMPETITIVE_SCAN.md and docs/BENCHMARK.md]
Large platforms (nCino, Abrigo, Baker Hill) have scale, integrations and SBA forms that we do not. Several vendors state security certifications we do not have yet. What we have built and tested: fact-level citations with checked memo numbers, and a human-only decision enforced by the database. We have not run a head-to-head test, so we make no claim to outperform anyone. The provisional wedge (a standalone SBA file-preparation workspace) rests partly on absence of evidence about competitors and needs lender conversations to confirm.

## 11. Plan
- **Days 1 to 30:** lender and processor conversations (B-116); timed manual baseline with two underwriters (B-131); choose identity provider (B-117); decide hosting (B-157).
- **Days 31 to 60:** with approval, one real model provider after reviewing its data terms (B-124); OCR (B-125); rerun the evaluation and publish real numbers including failures.
- **Days 61 to 90:** replace placeholder policy inputs with a partner's; add the debt schedule; external penetration test; counsel review; pilot on redacted, consented historical files; time both flows.
- **Stop conditions:** a figure reaches a decision unflagged and wrong; it does not beat the baseline; a vendor or regulatory requirement cannot be met.

## 12. Decisions we need from the team
1. Which lending lines and volumes first, and what outcome defines success?
2. Who can arrange lender conversations and two underwriters for the timed baseline?
3. Hosting for a pilot (recommendation: AWS containers; Vercel for testing only) and who approves vendor risk.
4. Which model provider to evaluate, and approval to make external calls with synthetic data first.
5. Which identity provider.
6. Who reviews the rules against SOP 50 10 and the legal list.

## 13. Demo guide (about 15 minutes)

### Setup
From a clone of the repository, in `workspace/app`: `npm ci`, point `UW_TEST_ADMIN_URL` at a disposable local Postgres superuser, then `bash scripts/demo-up.sh`. Open `http://127.0.0.1:3000/review`. You land on a stand-in sign-in page: choose a role. Use a private window per role. Keep the terminal open. Stop with Ctrl-C; rerunning rebuilds a synthetic database. If you cannot run it live, use demo/walkthrough/WALKTHROUGH.html (20-step narrated page) or demo/deck.html.

### Say first
All data is synthetic. The model is a stand-in. The tool prepares files; a human underwriter decides.

### Script
| Minutes | Do | Say |
|---|---|---|
| 1 | Sign in as Underwriter | Roles come from our database. Sessions can be revoked. Every sign-in is audited. |
| 1 | Open the queue | Prepared files with open exceptions by severity. Every status is needs review; the software never approves. |
| 2 | Open a flagged file | One critical exception: a document contained instruction-like text. The tool held those facts for a human and did not obey it. |
| 1 | Scroll to rule results | Eleven SBA rules, each with its SOP section. Failures and unknowns go to a person. The tool lists what it did not evaluate. |
| 1 | Scroll to facts | Every figure has a page and a quoted passage. "Accepted" means faithfully extracted, not verified true. |
| 1 | Scroll to the memo | Every line is cited and numbers are checked against the source. The memo cannot say approve or decline. |
| 2 | Try Approve with a reason only, then add a written override | The first attempt is refused because a critical exception is open. With the override it is recorded. The database enforces this. |
| 1 | Show the audit trail and the handed-off file | Append-only, hash-chained. Only an approved file went to the mock servicing system. |
| 3 | New window as Processor: apply at `/apply`, open the case, upload documents, click Build the file | Intake to prepared file in a few clicks. The tax ID shows only its last four digits. A processor who tries to decide is refused. |
| 1 | New window as Admin: open Admin | Users, roles, sessions, security events. An admin cannot demote or disable themselves. |

For the processor step, synthetic packets for the walkthrough are generated by `app/scripts/walkthrough-packets.ts`; `npm run walkthrough` plays the whole flow automatically and writes screenshots.

### Rough edges to say before they are noticed
Coverage ratios look high because synthetic financials are generous. Debt service uses only the new loan and a placeholder 9 percent rate. The sign-in provider is a local stand-in. The stand-in model reads printed labels, so accuracy figures do not predict real-document accuracy. Image-only files are routed to manual reading because OCR is not built.

## 14. Questions the team may ask
- **Does it make credit decisions?** No. Only an underwriter records a decision; the database refuses anything else.
- **Can it be wrong?** Yes. Facts are faithfully extracted, not verified true; the underwriter checks each against its source passage. We measured 0 false accepts on synthetic data with a stand-in model; real documents are untested.
- **Where does the data go?** Locally, nowhere. With a real model provider, identifiers are redacted first, and we review the provider's retention, training and region terms before any external call.
- **What stops one lender seeing another's data?** Row-level security enforced by the database, tested with positive controls.
- **What about prompt injection?** Document text is data. Instruction-like text raises a critical exception and holds that document's facts.
- **Is it compliant?** We have not claimed compliance. We map our controls to ASVS and NIST AI RMF as self-assessments, and we keep a list of items for counsel and compliance.
- **How much time does it save?** Unknown. We need a timed baseline.
- **Why not buy an existing platform?** Larger platforms cover more; we have not compared head to head. Our wedge needs lender validation.
- **What would a pilot need?** A real model provider and OCR, an identity provider, hosting decision, lender policy inputs, security testing, counsel review.

## 15. Glossary
- **SBA 7(a):** the Small Business Administration's main guaranteed loan program.
- **SOP 50 10:** SBA's standard operating procedure for lenders; we use version 8.1.
- **EIN:** employer identification number, the business tax ID.
- **Exception:** a flagged problem on a file, with a severity.
- **Override:** a written reason recorded when approving past an open critical or high exception.
- **Row-level security:** database rules that restrict each query to one lender's rows.
- **OIDC:** OpenID Connect, the standard for signing in through a company's identity provider.
- **Prompt injection:** text in a document that tries to give instructions to an AI.
- **Citation:** document, page and quoted passage attached to every extracted fact.
- **Tenant:** one lender organization using the system.

## 16. Where everything is
- State and plans: STATE.md, BACKLOG.md, DECISIONS.md (D-001 to D-035), ASSUMPTIONS.md, SOURCES.md.
- Design: docs/ARCHITECTURE.md, THREAT_MODEL.md, AUTHENTICATION.md, UPLOADS.md, DATA_PROTECTION.md, RULE_PACK.md, SBA_PROCESS_MAP.md, SERVICING_ADAPTER.md.
- Evidence: reports/EVALUATION_REPORT.md, docs/ASVS_SELF_ASSESSMENT.md, NIST_AI_RMF_MAPPING.md, BENCHMARK.md, MEASUREMENT_PLAN.md.
- Decisions pending: docs/HOSTING_OPTIONS.md, VERCEL_TEST_DEPLOYMENT.md, LEGAL_REVIEW.md, COMPLIANCE_ROADMAP.md.
- Presenting: demo/deck.html (18 slides), demo/walkthrough/WALKTHROUGH.html (20 steps), demo/DEMO_SCRIPT.md, demo/CEO_PLAN.md.
- Checks: `bash workspace/app/scripts/verify.sh` (the single completion check), `npm run walkthrough` (browser run with screenshots).
