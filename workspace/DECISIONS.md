# DECISIONS
Never edit silently; supersede with a new entry.

## D-001 Human makes every final credit decision (hard constraint)
Status: accepted (given by builder). The system may prepare, validate, flag, and advance workflow only. Decision recording requires an authenticated underwriter role. Pipeline status is never "approved".

## D-002 Language/framework (SUPERSEDED by D-008)
Options: Python+FastAPI; TypeScript+Node; Go. Choice: Python 3.12 + FastAPI. Rationale: existing foundation is Python; strongest document/ML/eval ecosystem; boring and widely adopted. Status: default, awaiting confirmation.

## D-003 Cloud and data store (default)
Options: AWS; GCP; Azure. Choice: AWS + Postgres (RDS) with row-level security. Rationale: widely adopted in bank-adjacent vendors; per-tenant KMS keys; matches DevSecOps background. Terraform skeleton only; nothing applied without approval. Local dev: Docker Compose. Status: default, awaiting confirmation. Cost report: $0 until anything is provisioned.

## D-004 Repo layout
Single repo `underwriting-copilot`; work under `workspace/`. Supersedes the earlier `underwriting/` subfolder layout. Existing foundation moved to `workspace/app/`.

## D-005 Wedge (SUPERSEDED by D-010)
Hypothesis: SBA 7(a) file preparation and exception detection for small community lenders.

## D-006 Domain
Commercial lending (SME and SBA). Supersedes docs/decisions/0002 (domain open).

## D-007 Hosting: Vercel (builder direction, 2026-10-21)
Supersedes the hosting part of D-003 (AWS). Options: Vercel; AWS; hybrid. Choice: Vercel for the web app and API (Python FastAPI runs as Vercel Functions per Vercel docs; default region iad1). Rationale: builder preference, low ops load for a solo builder.
Not decided yet: database (Vercel marketplace Postgres vs AWS RDS), object storage for borrower documents, background processing for long extraction jobs (function duration limits not yet verified), per-tenant encryption keys (KMS), and the LLM/OCR provider (Bedrock/Textract/other). Mixing clouds adds subprocessors to a lender's vendor review.
Constraints found (S-7): Hobby plan is restricted to non-commercial personal use; any production or revenue-linked use needs Pro or Enterprise. Pro allows up to 5 regions. Routing Middleware runs in every region regardless of region settings, so no regulated-data logic in middleware.
Rule: nothing is deployed, and no account or paid plan is created, without asking the builder first. Local dev stays Docker Compose.

## D-008 Language/stack: TypeScript on Vercel (accepted, builder, 2026-10-21)
Supersedes D-002. Choice: TypeScript (strict) on Node 22, Vitest for tests, npm, deployed to Vercel (D-007). Rationale: Vercel is TypeScript-native; LLM extraction calls an API and needs no Python. The earlier Python foundation (about 300 lines) was ported 1:1 to `workspace/app/src` with the same 6 fixture cases; money is held as integer cents, not floats.
Next.js app, database, object storage and background jobs are still open (B-113); Python may return only for the evaluation harness if it earns its place. Nothing is deployed.

## D-009 Workflow skills: broomva/skills, MIT (accepted, builder, 2026-10-21)
Use skills from https://github.com/broomva/skills (public, MIT), copied into `.agents/skills/` with the license and commit recorded in `.agents/skills/THIRD_PARTY.md`. Do not use material from any other organization's private repositories. Review a script before first use; `bookkeeping` has an optional external API call that stays disabled (see THIRD_PARTY.md).


## D-010 Wedge (provisional, 2026-10-21, supersedes D-005)
Choice: SBA 7(a) file review and credit-memo drafting for community-bank PLP lenders: cited extraction, SOP-mapped exception detection, human underwriter decision. Standard 7(a) and 7(a) Small first.
Rationale (docs/COMPETITIVE_SCAN.md): front-end intake and eligibility is now contested by nCino plus Parlay; SBA determines eligibility itself; lender-owned analysis and documentation exposure remains. Rejected: intake wedge, ML credit scoring, generic extraction as a product.
Status: provisional until a lender conversation tests A-10 to A-12. Owner of the next review: builder.

## D-011 to D-016 Open architecture decisions (2026-10-21)
Recorded in docs/ARCHITECTURE.md section 7: authentication provider (D-011), document storage and tenant keys (D-013), database (D-014), LLM/OCR providers (D-015), background execution (D-016). D-012 below is accepted.

## D-012 Architecture shape (provisional, 2026-10-21)
Choice: modular monolith in one Next.js/TypeScript codebase on Vercel, a pure-TypeScript domain core, durable workflows for processing, a single LLM gateway, Postgres with forced RLS and an append-only ledger, direct-to-storage uploads. Rejected for the MVP: microservices (solo builder), vector search/RAG (no need yet, extra attack surface), fine-tuning on tenant data.

## D-017 Model-risk reference point (2026-10-21)
Use SR 26-2 (April 17, 2026) principles, not SR 11-7 (superseded). Our deterministic rules are outside its "model" definition; our generative components are outside its scope but are governed with the same evidence pack (inventory, versioning, evaluation, monitoring, change control). Revisit if a lender or examiner treats the tool as a model.
