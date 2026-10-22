# OWASP ASVS 5.0.0 self-assessment (levels 1 and 2)

Date 2026-10-22. Standard: OWASP ASVS 5.0.0, May 2025 [V, S-50]. Requirement-level results are in `docs/asvs/ASVS_5.0.0_L2_assessment.csv` (253 requirements: 70 level 1 and 183 level 2; level 3 is out of scope). Requirement text is excerpted under CC BY-SA 4.0 from the OWASP project; statuses and evidence are ours. This is a self-assessment by the author with no independent verification, so it is not a conformance claim and not a certification. Level 2 is the target we would expect a lender to ask for given sensitive financial data [I]; no lender has said so.

Statuses: MET (implemented, evidence cited), PARTIAL, NOT_MET (absent), DEFERRED (depends on a decision not yet made: the authentication provider B-117 or the hosting choice D-026), NA (technology not used), NOT_ASSESSED.
The assessment is regenerated with `python3 docs/asvs/build_asvs.py <ASVS csv>`; executable evidence for the static claims is in `app/test/unit/asvs.test.ts`.

## Summary
| Chapter | MET | PARTIAL | NOT_MET | DEFERRED | NA | NOT_ASSESSED | Total |
|---|---|---|---|---|---|---|---|
| V1 Encoding and Sanitization | 8 | 4 | 0 | 0 | 14 | 1 | 27 |
| V2 Validation and Business Logic | 5 | 5 | 0 | 0 | 1 | 0 | 11 |
| V3 Web Frontend Security | 10 | 3 | 0 | 4 | 2 | 0 | 19 |
| V4 API and Web Service | 1 | 1 | 0 | 2 | 6 | 0 | 10 |
| V5 File Handling | 3 | 2 | 1 | 0 | 3 | 0 | 9 |
| V6 Authentication | 1 | 0 | 0 | 33 | 1 | 0 | 35 |
| V7 Session Management | 0 | 0 | 0 | 18 | 0 | 0 | 18 |
| V8 Authorization | 4 | 3 | 0 | 0 | 0 | 0 | 7 |
| V9 Self-contained Tokens | 0 | 0 | 0 | 7 | 0 | 0 | 7 |
| V10 OAuth and OIDC | 0 | 0 | 0 | 13 | 16 | 0 | 29 |
| V11 Cryptography | 10 | 2 | 0 | 0 | 2 | 0 | 14 |
| V12 Secure Communication | 2 | 0 | 0 | 4 | 3 | 0 | 9 |
| V13 Configuration | 3 | 4 | 0 | 6 | 0 | 0 | 13 |
| V14 Data Protection | 5 | 3 | 0 | 1 | 0 | 0 | 9 |
| V15 Secure Coding and Architecture | 4 | 9 | 0 | 0 | 0 | 0 | 13 |
| V16 Security Logging and Error Handling | 9 | 5 | 1 | 1 | 0 | 0 | 16 |
| V17 WebRTC | 0 | 0 | 0 | 0 | 7 | 0 | 7 |
| **All** | **65** | **41** | **2** | **89** | **55** | **1** | **253** |

Of the 253 requirements, 109 apply to what exists today (not NA, not deferred): 65 are met (60 percent), 41 partial, 2 not met, 1 not assessed. 89 more are deferred because authentication, sessions, tokens and host-level TLS do not exist yet; the project cannot claim level 2 until those are built and assessed. 55 are not applicable (for example WebRTC, GraphQL, XML, LDAP).

## What the assessment found and changed
Writing it down surfaced real gaps, two of which were fixed the same day:
1. Fixed: production could connect to the database without TLS (V12.3.1). `src/server-env.ts` now refuses a production database URL without `sslmode=require` or stricter; tests in `asvs.test.ts` (mutation-checked).
2. Fixed: documented local development credentials could be used in production (V13.2.3). Production now refuses them; same tests.
3. Documentation gaps closed: cryptographic inventory, data classification, logging inventory (docs/DATA_PROTECTION.md), remediation time frames (DEVSECOPS.md), access model updated (access-model.md).
4. Open: the rate limiter keys on the client-supplied X-Forwarded-For header, which is spoofable unless a trusted proxy overwrites it (V4.1.3, V15.3.4), backlog B-144.
5. Open: no malware scanning of uploads (V5.4.3); file extension is not compared with detected content (V5.2.2); any UTF-8 text upload is accepted, which could be SVG or HTML, harmless today because files are never served back but a constraint on the source-document viewer (B-129).
6. Open: no log shipping or alerting (V16.4.3), no authentication events (V16.3.1).

## What it means
We cannot say we meet ASVS level 1 or 2. We can say which of the requirements that apply today we meet and with what evidence, that 89 requirements wait on authentication and hosting, and that the biggest security gap versus incumbents remains authentication, independent testing and attestation (BENCHMARK.md). Next: build authentication (B-117), then re-run this assessment, then an independent test (B-139).
