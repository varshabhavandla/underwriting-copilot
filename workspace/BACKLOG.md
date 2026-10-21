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
- B-301 P0 doing Scaffold, local dev (docker compose), CI, IaC skeleton. Done: TypeScript core, verify, CI. Todo: Next.js shell, local Postgres, IaC.
- B-302 P0 todo  Domain model + multi-tenant data layer (Postgres RLS) + audit log.
- B-303 P0 todo  Borrower application flow (form + upload).
- B-304 P0 todo  Document ingestion: extraction/validation with confidence (tax returns, bank statements, financials).
- B-305 P0 todo  Rules engine + AI agent: completeness, consistency, exceptions, credit memo draft.
- B-306 P0 todo  Underwriter console with explicit approve/decline/request-info.
- B-307 P1 todo  Mock servicing adapter + events/webhooks.
- B-308 P0 todo  Evaluation harness + measured time-to-decision vs simulated baseline.
- B-309 P1 todo  Observability, hardening, threat model review.
- B-310 P2 todo  Synthetic data generator (tax returns, statements, financials, applications).
- B-117 P1 todo  Decide D-011 authentication provider against criteria (SSO, organizations, audit log, residency); verify price and security pages.
- B-118 P1 todo  Verify D-013/D-014/D-015: per-tenant key support, Postgres options with forced RLS and PITR, LLM provider data terms and SOC reports; produce a cost model from vendor price pages.
- B-119 P2 todo  CI check that every diagrams/*.mmd parses and docs embed the current copy.
- B-120 P1 todo  Implement CI controls from DEVSECOPS.md: secret scan, dependency audit, SAST, SBOM, IaC policy checks, RLS policy tests; decide attestation approach on Vercel.
- B-121 P1 todo  Primary-source follow-ups: OCC bulletin text for SR 26-2 companion, Federal Register 88 FR 37920 (third-party guidance), 16 CFR 314, AICPA Trust Services Criteria, Reg B text, CFPB circular status.
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
