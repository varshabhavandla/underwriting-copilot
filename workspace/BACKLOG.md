# BACKLOG
Status: todo | doing | done | blocked. Priority: P0 highest.

## Phase 1
- B-101 P0 done  Regulatory/process map (SBA: docs/SBA_PROCESS_MAP.md incl. appendices 14,15(part),16,17,19; conventional: docs/CONVENTIONAL_SME_PROCESS.md). Follow-ups B-111, B-115.
- (was) B-101 SBA 7(a)/504 done (docs/SBA_PROCESS_MAP.md). Remaining: conventional SME (OCC/FDIC/Fed sources), SOP appendices 14,15,16,19, Reg B, 504 detail.
- B-102 P0 done  Competitive scan and provisional wedge (docs/COMPETITIVE_SCAN.md, D-010). Follow-up B-116.
- B-103 P1 done  Measurement plan (docs/MEASUREMENT_PLAN.md). Execution is B-308.
- B-113 P1 todo  Vercel fit check: function duration/payload limits, background jobs, Postgres and storage options, region pinning, data-handling terms; read the Trust Center SOC 2 scope. Decide D-008 (data store, storage, jobs).
- B-115 P1 todo  Read SOP Appendix 15 in full (equity injection percentages) and 504 chapters before encoding those rule packs; spot-check every rule vs the published SOP (see C-201).
- B-116 P0 todo  Validate wedge: open vendor trust centers, find other SBA-specific vendors, and prepare 5 lender interview questions (A-10..A-12). Needs builder to arrange conversations.
## Phase 2
- B-201 P0 done  Reference architecture + 6 Mermaid diagrams (docs/ARCHITECTURE.md; diagrams/*.mmd parse-checked).
- B-202 P0 done  Agentic layer design (docs/AGENTIC_LAYER.md).
- B-203 P1 done  Fair lending / model risk (docs/FAIR_LENDING_MODEL_RISK.md); SR 11-7 superseded by SR 26-2, D-017.
- B-204 P1 todo  DevSecOps blueprint (IaC, SAST, dep/secret scan, SBOM, signing, policy as code).
- B-205 P1 done  Compliance roadmap and draft questionnaire answers (docs/COMPLIANCE_ROADMAP.md).
- B-206 P1 todo  Needs-legal-or-compliance-review list (maintained continuously in docs/LEGAL_REVIEW.md).
## Phase 3 (in order)
- B-301 P0 done  Scaffold: TypeScript core, Next.js shell (health, cases page), CI with Postgres service, docker-compose (written, not run here). IaC skeleton deferred to B-122 until D-013/D-014 are decided.
- B-302 P0 done  Domain model + multi-tenant data layer: migration 0001 (forced RLS, append-only decisions and audit, hash-chained ledger, decision gate), repo layer, 42 tests on real Postgres 16, 4 mutation checks, end-to-end demo.
- B-303 P0 done  Borrower application flow: validated application (SOP ownership total), EIN encrypted per tenant, /apply form and API, upload with content-type checks and encrypted storage. Dev-only tenant source; no auth or rate limiting (C-701).
- B-304 P0 todo  Document ingestion: extraction/validation with confidence (tax returns, bank statements, financials).
- B-305 P0 done  Rules engine (11 rules, SOP-cited, docs/RULE_PACK.md generated) + file builder: runs, exceptions, verified cited memo draft with the mock provider; 125 tests, 5 mutation checks. Real provider B-124.
- B-306 P0 done  Underwriter console: /review list and case page (facts with citations, rules, exceptions, cited memo, audit), exception disposition, memo adoption, decision API and form; DB-enforced gate; 137 tests; 5+2 mutation checks.
- B-307 P1 done  Mock servicing adapter behind an interface, DB outbox guarded by RLS, leased delivery with backoff, signed webhooks with SSRF checks, worker route, docs/SERVICING_ADAPTER.md; 160 tests, 7 mutation checks.
- B-308 P0 todo  Evaluation harness + measured time-to-decision vs simulated baseline.
- B-309 P1 todo  Observability, hardening, threat model review.
- B-310 P2 done  Synthetic generator: seeded packets with ground truth, 12 file classes (docs/MEASUREMENT_PLAN.md).
- B-117 P1 todo  Decide D-011 authentication provider against criteria (SSO, organizations, audit log, residency); verify price and security pages.
- B-118 P1 todo  Verify D-013/D-014/D-015: per-tenant key support, Postgres options with forced RLS and PITR, LLM provider data terms and SOC reports; produce a cost model from vendor price pages.
- B-119 P2 todo  CI check that every diagrams/*.mmd parses and docs embed the current copy.
- B-120 P1 todo  Implement CI controls from DEVSECOPS.md: secret scan, dependency audit, SAST, SBOM, IaC policy checks, RLS policy tests; decide attestation approach on Vercel.
- B-121 P1 todo  Primary-source follow-ups: OCC bulletin text for SR 26-2 companion, Federal Register 88 FR 37920 (third-party guidance), 16 CFR 314, AICPA Trust Services Criteria, Reg B text, CFPB circular status.
- B-122 P1 todo  IaC skeleton (after D-013/D-014); run docker-compose locally; add Postgres roles/RLS test to run against the chosen managed database.
- B-123 P1 todo  Add to the ledger tests: hash-chain anchoring design, per-tenant sequence gaps under rollbacks (a rolled-back insert leaves no gap because seq is computed inside the transaction), pooler (transaction mode) test.
- B-124 P0 todo  Real model provider behind the gateway: verify data terms (retention, training, region, SOC report), implement, run eval harness (docs/MEASUREMENT_PLAN.md) and report real numbers. Needs builder approval before any external call.
- B-125 P0 todo  OCR/PDF text extraction (provider choice D-015) so PDFs and scans are ingested; redaction of names and addresses; persistent token vault.
- B-126 P1 todo  Rate limiting, authentication and CSRF review on upload and application routes; signed direct-to-storage uploads for production.
- B-127 P1 todo  Lender overlay: replace the placeholder 9 percent assumed rate with lender pricing input; add existing-debt schedule and global cash flow (needed for DSC to resolve beyond needs_review).
- B-128 P1 todo  Extend ingestion and rules to documents the pack lists as not evaluated (owner PFS, credit reports, tax transcripts, collateral, debt schedule).
- B-129 P1 todo  Console gaps: underwriter confirmation of individual facts (G-A), memo editing before adoption, source-document viewer next to each citation, accessibility review, pagination.
- B-130 P1 todo  Per-tenant webhook subscriptions and secret rotation, dead-letter review and replay screen, egress allowlist for delivery, signature verification SDK snippet tests in another language.
- B-131 P0 todo  Timed manual baseline (two operators) and instrumented console timings; run `npm run timing`; needs a person. Add a review-opened event to the console to time assisted reviews.
- B-132 P2 todo  Add classes for collateral shortfall and low-quality scans once collateral data and OCR exist; larger N for tighter intervals.
## Workflow adoption (own design; skills from broomva/skills, MIT)
- B-401 P1 todo  Root router + scoped instruction files per package; AGENTS.md as the canonical file with CLAUDE.md pointing to it; skills in one canonical dir.
- B-402 P0 todo  Database-enforced invariants: forced row-level security on every table, no role with BYPASSRLS, append-only hash-chained audit/ledger, provenance required for every fact, one shared write path. Tests that fail if any is weakened.
- B-403 P1 todo  Ticket-as-prompt template (agent brief + verify commands); one ticket = one branch = one PR; verification receipts in the PR body.
- B-404 P1 todo  Pre-push fast checks (lint, types, tests, secret scan) and CI required checks incl. secret scan and migration-from-zero on a throwaway database.
- B-405 P1 todo  Control-gate hook for destructive commands, with a SINGLE source of truth for the denylist (two copies of a rule drift apart).
- B-406 P2 todo  Configure kg/bookkeeping (knowledge: block, PyYAML+mistune) once docs exceed what STATE/DECISIONS can carry. Skills are installed (D-009); coherence gate stays off.
- B-408 P1 todo  Review the installed scripts (p9, persist, bookkeeping) before first run; decide which skills we keep.
- B-407 P1 todo  Our own change-control rule for lender audit-readiness: a fully agent-merged flow has no human reviewer; we need at least builder review for rules, tenancy and security paths, recorded per change.
## Later (out of MVP)
- L-1 CRM beyond minimal lead tracking. L-2 Real servicing integrations. L-3 SOC 2 audit engagement.

## Critique log
Loop 2 (lender CISO / examiner view), objections and disposition:
- C-201 P0: Rules were derived from a script-parsed .docx; a wrong threshold in the checklist would mislead underwriters. Action: B-111 spot-check every encoded rule against the published SOP, store rule -> SOP section mapping with SOP version, and fail CI if the mapping is missing.
- C-202 P1: SOP changes frequently (8.1 effective 2026-10-01; notices in between). Action: B-112 rule packs versioned by SOP version and effective date; staleness check against SBA's SOP page.
- C-203 P1: No evidence yet that AI-prepared files satisfy a lender's model-risk and vendor-management expectations. Action: covered by B-203/B-205; also LEGAL_REVIEW items 1 and 7.

Loop 3 (lender CISO / examiner view), objections and disposition:
- C-301 P0: Reg B, 1071 and OCC points rest on search summaries and a 1990/1998 handbook. Action: B-115/B-116 plus counsel items 13-15; no rule ships on a summary alone.
- C-302 P1: Wedge rests on absence-of-evidence about competitors. Action: B-116 verifies trust centers and searches for more SBA vendors; keep D-010 provisional.
- C-303 P1: Nothing yet measured about time saved; the only 80 percent figure we found is an unnamed-customer vendor claim. Action: B-103 and B-308 define a simulated baseline; report by file class.

Loop 4 (lender CISO / examiner view), objections and disposition:
- C-401 P0: Redaction before the model may break extraction, and injection defenses are "defense in depth" with no proof. Action: adversarial and redaction test sets are part of B-308; results reported, not assumed (A-15).
- C-402 P0: Hybrid cloud (Vercel plus AWS keys/storage) multiplies subprocessors and credential paths. Action: B-118 compares an all-Vercel-marketplace option to the hybrid; choose the smaller vendor set that still gives per-tenant keys.
- C-403 P1: A solo builder is the only reviewer (G-E). Action: B-407 records each review; flag as a known limitation in the lender security answers.

Loop 5 (lender CISO / examiner view), objections and disposition:
- C-501 P0: Several compliance statements rest on secondary sources. Action: B-121; the questionnaire answers carry status tags and no claim exceeds what is true today.
- C-502 P0: "Designed to support audit evidence" can be read as a compliance claim. Action: wording rule in the roadmap (no certification language before an issued report); add a claims-review step using the legal-readiness skill before any external document.
- C-503 P1: A solo vendor is a concentration and continuity risk for a bank (key-person, business continuity). Action: add escrow/continuity and documentation commitments to the vendor pack; list as a known limitation.

Loop 6 (lender CISO / examiner view), objections and disposition:
- C-601 P0: Tests ran on a locally installed Postgres 16, not the managed database we will use, and the Docker Compose file was not run. Action: B-122 reruns the same suite against the chosen managed Postgres before any real data.
- C-602 P0: The app role can insert users (admin path) and the dev tenant stand-in is not authentication. Action: D-011/B-117; restrict user provisioning to an admin role and remove DEV_TENANT_ID path once auth exists; guard already fails closed in production.
- C-603 P1: The hash chain detects tampering by a privileged actor only if someone verifies it and the head is anchored outside the database. Action: B-123 and anchoring in the hardening phase; claim "tamper-evident", not "tamper-proof".

Loop 7 (lender CISO / examiner view), objections and disposition:
- C-701 P0: Upload and application routes have no authentication, rate limiting or malware scanning, and the tenant is a dev stub. Action: B-126 and D-011 before any exposure; the app refuses to start with the dev stub in production.
- C-702 P0: Everything is proven with a mock that reads printed labels. Real extraction quality, OCR and redaction effects are unmeasured. Action: B-124/B-125; no accuracy claim until then (MEASUREMENT_PLAN results section says so).
- C-703 P1: "Accepted" can be misread as "verified true". Action: D-019 wording; the underwriter console (step 6) must label facts as extracted-and-consistent, and show unverified-against-source status.
- C-704 P1: Redaction covers identifiers but not names or addresses, so a provider would still see them. Action: B-125 and contract terms with the provider.

Loop 8 (lender CISO / examiner view), objections and disposition:
- C-801 P0: Rule thresholds and SOP section names were drafted from machine-parsed text; one wrong constant misleads underwriters. Action: B-111/B-115 spot-check against the published SOP; RULE_PACK.md is generated so the lender can review one document.
- C-802 P1: DSC uses an assumed rate and ignores existing debt, so it can only fail or ask for review, never confirm adequacy. Action: stated in every result; B-127.
- C-803 P1: Rules read only accepted facts, so a defect that blocks acceptance can make a rule report needs_review or not applicable rather than a specific failure. Action: reviewed (freshness now reports needs_review); the ingestion exception still carries the specific defect; revisit when the console shows both together (step 6).
- C-804 P1: The memo drafter is a mock; a real model may produce fluent text that fails the strict number-matching verifier often, increasing human work. Action: measure rejection rate in the real-provider evaluation (B-124) and tune prompts, not the verifier.

Loop 9 (lender CISO / examiner view), objections and disposition:
- C-901 P0: The console runs on a dev tenant and user stub, so "authorized underwriter" is a database role, not a verified identity. Action: D-011/B-117 before any real use; MFA and SSO for staff.
- C-902 P1: An override is free text; an underwriter can type anything. Action: this is intended accountability (recorded, audited, reviewable); add reporting on overrides to the monitoring dashboard (B-309) and consider a required reason taxonomy with the lender.
- C-903 P1: The page shows document passages verbatim; hostile content is escaped by React but could still mislead a reader. Action: injection-flagged documents are labeled critical; add visible flags next to each affected fact in B-129.
- C-904 P1: No pagination, concurrency control or optimistic locking on decisions; two underwriters could act on one case. Action: the final-decision guard makes the second attempt fail safely; add case assignment and locking (B-129).

Loop 10 (lender CISO / examiner view), objections and disposition:
- C-1001 P1: At-least-once delivery means a real servicing system could see duplicates if it ignores the idempotency key. Action: contract requirement in the adapter doc; the adapter must pass the key through.
- C-1002 P1: The delivery worker runs as the application role for a tenant context; a multi-tenant worker needs a safe way to iterate tenants without a bypass role. Action: B-130; iterate a tenant list from the control plane and run one tenant context at a time.
- C-1003 P2: Event payloads contain the borrower legal name in the boarding package, which goes to a third party. Action: expected for boarding; covered by the lender contract and the subprocessor list; the webhook path carries ids only.

Loop 11 (lender CISO / examiner view), objections and disposition:
- C-1101 P0: A reader may quote the estimated ratios as a result. Action: labeled ESTIMATED in the report, a "do not quote" line, a test that the report never states a savings percentage, and D-024.
- C-1102 P1: The mock reads the same label templates the generator prints, so accuracy figures are inflated. Action: stated in the report header; real-provider runs (B-124) on the same harness before any accuracy statement.
- C-1103 P1: Baseline operator knows the system, biasing the baseline fast. Action: disclosed in the protocol; second operator in B-131.
