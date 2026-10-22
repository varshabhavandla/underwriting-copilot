# OWASP ASVS 5.0.0 self-assessment (levels 1 and 2)

Date 2026-10-22 (updated the same day after sign-in was built). Standard: OWASP ASVS 5.0.0, May 2025 [V, S-50]. Requirement-level results are in `docs/asvs/ASVS_5.0.0_L2_assessment.csv` (253 requirements: 70 level 1 and 183 level 2; level 3 is out of scope). Requirement text is excerpted under CC BY-SA 4.0 from the OWASP project; statuses and evidence are ours. This is a self-assessment by the author with no independent verification, so it is not a conformance claim and not a certification. Level 2 is the target we would expect a lender to ask for given sensitive financial data [I]; no lender has said so.

Statuses: MET (implemented, evidence cited), PARTIAL, NOT_MET (absent), DEFERRED (depends on a decision not yet made: the identity provider B-117, or the hosting choice D-026), NA (technology not used), NOT_ASSESSED.
The assessment is regenerated with `python3 docs/asvs/build_asvs.py <ASVS csv>`; executable evidence is in `app/test/unit/asvs.test.ts`, `app/test/unit/auth.test.ts`, `app/test/db/auth.test.ts` and `app/scripts/e2e-auth.mjs`.

## Summary
| Chapter | MET | PARTIAL | NOT_MET | DEFERRED | NA | NOT_ASSESSED | Total |
|---|---|---|---|---|---|---|---|
| V1 Encoding and Sanitization | 8 | 4 | 0 | 0 | 14 | 1 | 27 |
| V2 Validation and Business Logic | 5 | 5 | 0 | 0 | 1 | 0 | 11 |
| V3 Web Frontend Security | 15 | 2 | 0 | 0 | 2 | 0 | 19 |
| V4 API and Web Service | 1 | 1 | 0 | 2 | 6 | 0 | 10 |
| V5 File Handling | 3 | 2 | 1 | 0 | 3 | 0 | 9 |
| V6 Authentication | 4 | 2 | 0 | 27 | 2 | 0 | 35 |
| V7 Session Management | 11 | 4 | 1 | 2 | 0 | 0 | 18 |
| V8 Authorization | 5 | 2 | 0 | 0 | 0 | 0 | 7 |
| V9 Self-contained Tokens | 5 | 1 | 0 | 0 | 1 | 0 | 7 |
| V10 OAuth and OIDC | 8 | 0 | 0 | 0 | 21 | 0 | 29 |
| V11 Cryptography | 10 | 2 | 0 | 0 | 2 | 0 | 14 |
| V12 Secure Communication | 2 | 0 | 0 | 4 | 3 | 0 | 9 |
| V13 Configuration | 3 | 4 | 0 | 6 | 0 | 0 | 13 |
| V14 Data Protection | 6 | 3 | 0 | 0 | 0 | 0 | 9 |
| V15 Secure Coding and Architecture | 4 | 9 | 0 | 0 | 0 | 0 | 13 |
| V16 Security Logging and Error Handling | 10 | 5 | 1 | 0 | 0 | 0 | 16 |
| V17 WebRTC | 0 | 0 | 0 | 0 | 7 | 0 | 7 |
| **All** | **100** | **46** | **3** | **41** | **62** | **1** | **253** |

Of the 253 requirements, 150 apply to what exists today (not NA, not deferred): 100 are met (67 percent), 46 partial, 3 not met, 1 not assessed. 41 are deferred: about 27 are password, recovery and one-time-code rules that belong to the identity provider and cannot be checked until one is chosen (B-117), and the rest are host-level (TLS termination, HTTP parsing, secret store, deployment settings). 62 are not applicable (for example WebRTC, GraphQL, XML, LDAP, and OAuth authorization-server duties). Before sign-in was built the figures were 65 met, 41 partial, 2 not met and 89 deferred.

## What the assessment found and changed
1. Fixed (earlier): production could connect to the database without TLS (V12.3.1) and could use the documented local development credentials (V13.2.3). `src/server-env.ts` now refuses both; tests are mutation-checked.
2. Built: OpenID Connect sign-in with PKCE, state and nonce, strict ID token validation, database-enforced sessions (idle and absolute timeouts, immediate revocation, disabled users cut off), role checks on every route, and Clear-Site-Data on sign-out (docs/AUTHENTICATION.md). Production now refuses to start without it.
3. Documentation gaps closed: cryptographic inventory, data classification, logging inventory (DATA_PROTECTION.md), remediation time frames (DEVSECOPS.md), access model, authentication design.
4. Open: the rate limiter keys on the client-supplied X-Forwarded-For header, which is spoofable unless a trusted proxy overwrites it (V4.1.3, V15.3.4), B-144.
5. Open: no malware scanning of uploads (V5.4.3); file extension is not compared with detected content (V5.2.2); any UTF-8 text upload is accepted, harmless today because files are never served back but a constraint on the source-document viewer (B-129).
6. Open: no log shipping or alerting (V16.4.3); users cannot view or end their own sessions in a screen (V7.5.2) and admins have no administration screen (V7.4.5, B-148); no CSRF token (V3.5.1); acr and auth_time are not checked (V6.8.4).

## What it means
We cannot say we meet ASVS level 1 or 2. We can say which of the requirements that apply today we meet and with what evidence. Sign-in is built and tested against a fake provider only; a real provider has not been chosen, so the provider-delegated requirements are unverified. The biggest security gaps versus incumbents are now independent testing and attestation (BENCHMARK.md). Next: choose and evaluate a provider (B-117), re-run this assessment against it, then an independent test (B-139).
