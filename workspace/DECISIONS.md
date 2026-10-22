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

## D-018 Local development database (2026-10-21)
Postgres 16 with two roles: uw_owner (owns tables, migrations only) and uw_app (application; not superuser, no BYPASSRLS, owns nothing). Passwords in the repo are local-only. Production database vendor remains open (D-014); the test suite is the acceptance test for any candidate: it must pass unchanged against the candidate.

## D-019 Meaning of an accepted fact (2026-10-22)
Accepted = faithfully extracted, cited to a passage that exists, valid for its type, consistent under deterministic validators, and from a document with no injection flag. Not "true". Model confidence is recorded for audit and never used. Auto-accept never applies to facts blocked by a validator or from a flagged document.

## D-020 Import style (2026-10-22)
Relative imports are extensionless (no .js suffix) because Next's Turbopack bundler does not map .js to .ts; TypeScript (Bundler resolution), tsx and Vitest all accept this.

## D-021 Rules and memo boundaries (2026-10-22)
Rules are deterministic code, read accepted facts only, cite an SOP section and version, and fail closed (a rule that cannot be evaluated is needs_review, never pass). Debt-service coverage is computed for the new loan alone with a placeholder lender-overlay rate; below 1.15 is a definite fail, otherwise needs_review because existing debt is unknown. A memo draft is stored only if every line cites a known source, every number matches the cited source, there is no decision language, and the four required sections exist; otherwise it becomes a memo_unverified exception. The tool never approves or declines; the build step leaves cases in needs_review.

## D-022 Decision gate details (2026-10-22)
Approving a case that still has open critical or high exceptions requires at least one recorded override explaining why; the database enforces it. A decided case (approved, declined, handed_off) accepts no further decision and no status change except approved to handed_off. Request-more-info moves a case to info_requested and is not final. The console labels facts as extracted and internally consistent, not verified against the source (D-019).

## D-023 Outbox and delivery (2026-10-22)
Events go through a database outbox created by a trigger on decisions and guarded by row-level security (no event without a matching human decision). Delivery is at least once with leases, exponential backoff and a cap; consumers dedupe on the event id or idempotency key. Webhooks are HMAC-SHA256 signed with a timestamp (300-second window) and refuse non-public targets. Free-text reasons and the full EIN are never sent. Details: docs/SERVICING_ADAPTER.md.

## D-024 How time-to-decision is reported (2026-10-22)
The evaluation reports three labeled things: measured pipeline behavior on synthetic data, an ESTIMATED time model built from stated assumptions, and (when someone supplies it) timed human data analyzed by `npm run timing`. The estimated model is never quoted as a result, includes the underwriter's verification burden, and shows a range that can exceed 1.00. The "up to 80 percent" claim in the reference pitch stays an unverified vendor claim.

## D-025 Hardening baseline (2026-10-22)
Every API route goes through one wrapper (request id, per-client rate limit, content-type and size guards, scrubbed logging, generic errors, metrics), and a policy test fails if a route bypasses it. Rate limiting is in-process for now and is declared partial in THREAT_MODEL.md. Secret scan, audit and SBOM are minimal and labeled as such; full tooling is B-134.

## D-026 Hosting and data-store options for the pilot (2026-10-22)
Vercel Functions fit the workload (docs/VENDOR_FIT.md); uploads must go direct to storage above 4.5 MB, a connection pooler is required, and Pro or Enterprise is required for commercial use. Managed Postgres (Neon is the candidate priced) is an option, not a decision: role and forced-RLS compatibility and attestation scope are unverified. No purchase or account creation without builder approval.

## D-027 Browser-level checks belong in the demo path (2026-10-22)
The curl-based e2e could not see that the no-referrer header broke browser form posts. The fix is Referrer-Policy same-origin plus a config test. Backlog B-137: add a headless-browser check of decide/dispose/adopt/apply to verify.sh.

## D-028 Self-assessments are evidence-linked and test-checked (2026-10-22)
The ASVS and NIST AI RMF assessments cite repository evidence, label unmet and deferred items, make no conformance claim, and are guarded by tests (static code claims, production configuration guards, document consistency). A claim that cannot be pointed at evidence is recorded as PARTIAL, GAP or NOT_ASSESSED.

## D-029 Authentication: OpenID Connect relying party, database-enforced sessions (2026-10-22)
Decision: we do not build passwords or MFA. The app is an OpenID Connect client (authorization code with PKCE, state, nonce, strict ID token validation) that maps an identity provider subject to a user a lender admin provisioned; tenant and role come from our database. Sessions are opaque random tokens whose SHA-256 is stored; the application role can reach identity and session tables only through SECURITY DEFINER functions, so expiry, inactivity, revocation and disabled users are enforced in the database. Added dependencies with reasons: `jose` (MIT, no dependencies; hand-written JWT verification is a known source of vulnerabilities) and, for tests only, `playwright-core` (browser end-to-end checks; it found the Referrer-Policy bug class). A fake provider under test/support exists for development and tests and refuses to run in production. The choice of a real provider remains open (B-117); AUTHENTICATION.md holds the evaluation checklist. Reversal: the OIDC layer is isolated in src/auth and three auth routes; the session tables and functions are independent of the provider.

## D-030 Per-organization single sign-on (2026-10-22)
Each lender can use its own identity provider (SSO_MODE=per_tenant). The operator provisions organization, sign-in name and first admin with a database-owner tool; the organization's admin configures issuer, client and secret in the app. The secret is encrypted under the tenant key and is write-only. The provider is bound to the sign-in flow by the sealed cookie, sessions can only be created in the organization the flow started for, and outbound requests to administrator-supplied URLs use a guard against private and metadata addresses. Alternatives rejected: first-login account linking by email (account-takeover risk), one global provider with tenant claims (the provider would decide tenancy), admin-chosen organization names (squatting). Cost: a same-site hop for the sign-in form because of the form-action policy, and an operator provisioning step. Reversal: SSO_MODE=global keeps the single-provider path unchanged.

## D-031 Security gap closure: proxy trust, upload hardening, pinned egress (2026-10-22)
Rate limiting trusts only the address our own proxy added to X-Forwarded-For (TRUSTED_PROXY_HOPS, mandatory in production; Vercel overwrites the header, S-55), otherwise one shared bucket. Uploads must have a name that matches their detected content, no markup disguised as text, no active PDF content, and pass a malware scan that fails closed; production requires a scanner (CLAMD_HOST). Outbound calls to administrator-supplied URLs use a connection whose own lookup validates addresses, closing the DNS rebinding window. Dependency added: `undici` (MIT; it is the HTTP client behind Node's fetch and the only way to supply a custom connection lookup). Alternatives rejected: trusting the leftmost forwarded address (spoofable), accepting uploads when the scanner is down (fails open), validating DNS once before a separate fetch (rebinding). Cost: a scanner is now a deployment prerequisite; hosting and its price are unverified (B-155).

## D-032 Hosting: options recorded, decision pending (2026-10-22)
docs/HOSTING_OPTIONS.md compares Vercel with Neon, AWS containers, Google Cloud and a hybrid against what the application needs. Recommendation (not a decision): AWS containers for a lender pilot, because the isolation model, the scanner and key custody then work as built, at a lower floor price; Vercel with Neon only after two cheap tests (role bypass of row-level security, transaction-local settings through the pooler) pass. D-026 (Vercel as the pilot host) is therefore under review. No account has been created and nothing has been bought.

## D-033 Vercel for testing only (2026-10-22)
The builder chose Vercel for testing. This does not settle the pilot hosting (D-032, B-157). To make a test deployment possible without a writable disk, documents can be stored as encrypted rows (OBJECT_STORE=postgres), and a test deployment may omit the scanner only with an explicit acknowledgment that adds a banner to every page; the production guard otherwise still requires a scanner. The Neon role and pooler questions are turned into a runnable check (npm run db:check) instead of an assumption. Reversal: remove the banner flag and use a managed bucket and scanner; the store sits behind the ObjectStore interface.

## D-034 Browser walkthrough is part of the evidence (2026-10-22)
`npm run walkthrough` drives the whole workflow in Chromium on a fresh local stack: four roles sign in, a processor applies, uploads and builds three synthetic files, an underwriter adopts the memo, disposes exceptions and decides (approve, refused-without-override, decline, override), delivery runs, and the database is checked (audit chain, citations, encrypted EIN and documents, no PII in logs). 40 of 40 steps pass; screenshots and REPORT.md are in demo/walkthrough/. It found two defects the curl e2e could not: Sign out was blocked by the form-action CSP (now a plain /signed-out page) and no screen existed to upload documents or build the file (now on the case page, sharing src/ingest/receive.ts with the API route). Not run in verify.sh because it needs Chromium and a free port pair; run it before demos.

