# BACKLOG
Status: todo | doing | done | blocked. Priority: P0 highest.

## Phase 1
- B-101 P0 doing Regulatory/process map. SBA 7(a)/504 done (docs/SBA_PROCESS_MAP.md). Remaining: conventional SME (OCC/FDIC/Fed sources), SOP appendices 14,15,16,19, Reg B, 504 detail.
- B-103 P1 todo  Time-to-decision measurement plan (measured vs estimated; simulated baseline definition).
- B-113 P1 todo  Vercel fit check: function duration/payload limits, background jobs, Postgres and storage options, region pinning, data-handling terms; read the Trust Center SOC 2 scope. Decide D-008 (data store, storage, jobs).
## Phase 2
- B-201 P0 todo  Reference architecture + Mermaid (components, flows, trust boundaries, tenant isolation, per-tenant encryption).
- B-202 P0 todo  Agentic layer design (LLM gateway, PII redaction, injection defenses vs OWASP LLM Top 10, approval gates, immutable audit).
- B-203 P1 todo  Fair lending / model risk (ECOA/Reg B, SR 11-7 principles, versioned rules/prompts, adverse-action support).
- B-204 P1 todo  DevSecOps blueprint (IaC, SAST, dep/secret scan, SBOM, signing, policy as code).
- B-205 P1 todo  Compliance roadmap (GLBA, FFIEC, TPRM, SOC 2 staging) + draft vendor questionnaire answers.
- B-206 P1 todo  Needs-legal-or-compliance-review list (maintained continuously in docs/LEGAL_REVIEW.md).
## Phase 3 (in order)
- B-301 P0 todo  Scaffold, local dev (docker compose), CI, IaC skeleton (partly done: CI + verify exist).
- B-302 P0 todo  Domain model + multi-tenant data layer (Postgres RLS) + audit log.
- B-303 P0 todo  Borrower application flow (form + upload).
- B-304 P0 todo  Document ingestion: extraction/validation with confidence (tax returns, bank statements, financials).
- B-305 P0 todo  Rules engine + AI agent: completeness, consistency, exceptions, credit memo draft.
- B-306 P0 todo  Underwriter console with explicit approve/decline/request-info.
- B-307 P1 todo  Mock servicing adapter + events/webhooks.
- B-308 P0 todo  Evaluation harness + measured time-to-decision vs simulated baseline.
- B-309 P1 todo  Observability, hardening, threat model review.
- B-310 P2 todo  Synthetic data generator (tax returns, statements, financials, applications).
## Workflow adoption from SRI patterns (ideas only, own wording; blocked on legal item 12 for any copying)
- B-401 P1 todo  Root router + scoped instruction files per package; AGENTS.md as the canonical file with CLAUDE.md pointing to it; skills in one canonical dir.
- B-402 P0 todo  Database-enforced invariants: forced row-level security on every table, no role with BYPASSRLS, append-only hash-chained audit/ledger, provenance required for every fact, one shared write path. Tests that fail if any is weakened.
- B-403 P1 todo  Ticket-as-prompt template (agent brief + verify commands); one ticket = one branch = one PR; verification receipts in the PR body.
- B-404 P1 todo  Pre-push fast checks (lint, types, tests, secret scan) and CI required checks incl. secret scan and migration-from-zero on a throwaway database.
- B-405 P1 todo  Control-gate hook for destructive commands, with a SINGLE source of truth for the denylist (SRI's own docs warn about two copies drifting).
- B-406 P2 todo  Knowledge graph + handoff skills once docs exceed what STATE/DECISIONS can carry.
- B-407 P1 todo  Our own change-control rule for lender audit-readiness: SRI has no human reviewer by design; we need at least builder review for rules, tenancy and security paths, recorded per change.
## Later (out of MVP)
- L-1 CRM beyond minimal lead tracking. L-2 Real servicing integrations. L-3 SOC 2 audit engagement.

## Critique log
Loop 2 (lender CISO / examiner view), objections and disposition:
- C-201 P0: Rules were derived from a script-parsed .docx; a wrong threshold in the checklist would mislead underwriters. Action: B-111 spot-check every encoded rule against the published SOP, store rule -> SOP section mapping with SOP version, and fail CI if the mapping is missing.
- C-202 P1: SOP changes frequently (8.1 effective 2026-10-01; notices in between). Action: B-112 rule packs versioned by SOP version and effective date; staleness check against SBA's SOP page.
- C-203 P1: No evidence yet that AI-prepared files satisfy a lender's model-risk and vendor-management expectations. Action: covered by B-203/B-205; also LEGAL_REVIEW items 1 and 7.
