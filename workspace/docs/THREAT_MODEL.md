# Threat model (STRIDE over the built components)

Scope: the MVP in `app/` as built through loop 12, run locally on synthetic data. Status labels: **enforced** (code or database rule with a test that fails if removed), **partial**, **planned**, **assumed** (depends on a deployment choice not yet made). This is an engineering model, not a security certification, and has not been reviewed by a third party.

## Assets
1. Borrower identifiers and financial documents (EIN, bank, tax). 2. The decision record and audit ledger (integrity). 3. Tenant isolation. 4. Lender credentials and webhook secrets. 5. The rule that a human makes the credit decision.

## Trust boundaries
Browser/applicant -> Next routes -> Postgres (RLS) | Next routes -> LlmGateway -> model provider (mock today) | Next routes -> object store | Outbox worker -> lender servicing adapter (mock today).

## STRIDE
| ID | Threat | Mitigation | Status | Evidence |
|---|---|---|---|---|
| S1 | Caller acts as another tenant or user | Identity comes from a server-verified session (OpenID Connect sign-in, opaque revocable token, role and tenant read from our database); tenant and user set per transaction, never from the request body; forced RLS on every table; `uw_app` is not owner and has no BYPASSRLS | enforced; tested against a fake provider only, no real provider chosen (B-117) | test/db/rls.test.ts, test/db/auth.test.ts, scripts/e2e-auth.mjs |
| S2 | Non-underwriter records a decision | Database gate: only an underwriter acting as themselves | enforced | test/db/review.test.ts |
| S3 | Forged webhook or replay | HMAC-SHA256, 300 s window, constant-time compare, SSRF checks on targets | enforced | test/unit/servicing.test.ts |
| T1 | Edit or delete history (decisions, audit, rule runs, memos, outbox) | Append-only triggers, no UPDATE/DELETE policy, hash-chained ledger with `audit_verify_chain()` | enforced | test/db/rls.test.ts, e2e chain check |
| T2 | Approval past open critical/high exceptions without override | Decision gate in the database | enforced | test/db/review.test.ts |
| T3 | Model output changes a figure or invents a source | Citation verified against original text; validators; memo verifier checks every number against its cited source | enforced (mock provider only) | test/unit/extraction.test.ts, memo.test.ts, eval report |
| T4 | Prompt injection in a document steers extraction or the memo | Output schema allowlist; injection flag blocks auto-accept; memo cannot contain decision language; model has no tools and no write path | enforced against the mock's injection behavior; unproven against a real model | eval class "injected instructions": 0 false accepts |
| R1 | Denying who decided what | Decision rows are append-only and chained into the ledger with actor and time | enforced | test/db/review.test.ts |
| R2 | Request cannot be traced | Request id on every response and log line | enforced | test/unit/hardening.test.ts, e2e |
| I1 | Identifiers at rest | Per-tenant AES-256-GCM field encryption, only last4 in the clear; encrypted object store | enforced (local key provider; KMS is planned) | test/unit/crypto-storage.test.ts, e2e |
| I2 | Identifiers in logs, errors, metrics | Scrubbing logger (names, patterns, truncation), generic 500 body with request id, bounded metric labels | enforced | test/unit/hardening.test.ts, e2e "no EIN in server log" |
| I3 | Identifiers sent to a model | Redaction before egress; single egress point; budgets | enforced | test/unit/extraction.test.ts |
| I4 | Cross-tenant read via error text or ids | RLS returns no rows; 404 for foreign ids | enforced | test/db/rls.test.ts |
| I5 | Secret committed to the repo | Secret scan in `verify` | partial (pattern scan; a full scanner is B-120) | scripts/secret-scan.ts, hardening.test.ts |
| D1 | Request flooding | Per-route per-client rate limit, fail-closed on key flooding, body size caps | partial (in-process counter; per-instance on serverless, so an edge or shared-store limit is needed in production) | hardening.test.ts |
| D2 | Hostile uploads | Content-based type check, size cap, encrypted store, unreadable files routed to manual review | enforced | test/unit/crypto-storage.test.ts |
| D3 | Runaway model cost | Per-case and per-call budgets and timeout in the gateway | enforced (mock) | test/unit/extraction.test.ts |
| E1 | Route added without controls | Policy test: every `app/api/**/route.ts` must use `withRequest` with a rate limit | enforced | hardening.test.ts |
| E2 | Worker or metrics endpoint open | Bearer secret compared in constant time; metrics disabled unless a secret is set | enforced | e2e |
| E3 | Browser-side attacks (framing, sniffing, injected content) | nosniff, frame-deny, no-referrer, COOP/CORP, HSTS, `default-src 'none'` on API responses, restricted page policy | partial (no nonce-based script policy yet, B-133) | e2e header check |
| E4 | Vulnerable dependency | `npm audit --omit=dev` in CI at high severity; CycloneDX SBOM artifact | partial (no signing or provenance, B-120) | CI workflow |

| S4 | Forged or substituted ID token (wrong audience, issuer, nonce, algorithm none or HS256, foreign key) | Signature against the provider's published keys, asymmetric algorithm allowlist, issuer, audience, azp, expiry, token age, nonce, optional required amr | enforced | test/unit/auth.test.ts |
| S5 | Login CSRF or authorization code injection | State bound to an encrypted flow cookie, PKCE S256, nonce, single-use code, exact redirect URI, return paths limited to same-site relative | enforced | auth.test.ts, e2e-auth.mjs |
| S6 | Stolen or replayed session cookie | 256-bit token, only its hash stored, Secure HttpOnly SameSite=Lax __Host- cookie, idle and absolute timeouts, immediate server-side revocation on logout, user disable and admin revoke | enforced (theft of a live cookie from a compromised browser is not prevented) | test/db/auth.test.ts, e2e-auth.mjs |
| E5 | Role escalation: a viewer or processor records a decision, an unprovisioned identity gets in | Role per route checked by a policy test, decision gate in the database, identities only via admin-linked pre-provisioning, claims never grant roles | enforced | hardening.test.ts, auth.test.ts, e2e-auth.mjs |
| E6 | Application role reads or forges sessions and identities | Auth tables unreadable by the application role; only SECURITY DEFINER functions, internal helpers not granted | enforced | test/db/auth.test.ts |
| E7 | A compromised application creates users or raises a role outside the admin checks | Application role has no INSERT on users; user, role and identity changes go through admin-only functions that require an acting admin in the tenant and audit themselves; an admin cannot demote or disable themselves | partial (a compromised app can still assert an admin as the acting user, see residual risks) | test/db/admin.test.ts |
| R3 | Sign-ins and sign-outs not attributable | Audit events in the tenant ledger for success; reason-coded logs for failures | enforced | e2e-auth.mjs |

## Residual risks (not mitigated)
- No real identity provider has been chosen or evaluated (B-117); sign-in is tested with a fake provider. Production refuses to start without OIDC settings or with the development identity.
- The application server asserts the acting user inside each transaction; a compromised application can act as any user (docs/AUTHENTICATION.md).
- In-process rate limiting does not hold across serverless instances.
- Behavior against a real model, real OCR and real documents is unmeasured (B-124).
- No third-party penetration test, no SAST, no signed builds.
- Vercel runtime, data residency and subprocessor terms are unreviewed; list for counsel is in LEGAL_REVIEW.md.
