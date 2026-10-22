# Vendor fit and regulatory follow-ups (B-113, B-118, B-121)

Researched 2026-10-22 from vendor documentation pages and primary regulatory text. Labels: V = verified from the cited page; I = inferred; U = unverified (not found or not read). Prices change; re-check before any purchase. Nothing here was purchased, provisioned, or discussed with a vendor.

## 1. Vercel fit (B-113)
| Topic | Finding | Label | Source |
|---|---|---|---|
| Function duration | Fluid compute: default 300 s; Pro/Enterprise max 800 s, 1800 s extended (beta); Hobby 300 s | V | S-35 |
| Request/response body | 4.5 MB per function; larger returns 413. Our upload cap is 4 MB, so production uploads need direct-to-storage (B-126) | V | S-35 |
| Memory | Hobby 2 GB; Pro/Enterprise up to 4 GB | V | S-35 |
| Database connections | 1,024 file descriptors shared across concurrent executions; pooling advised. Our `postgres.js` use needs a pooler in production | V | S-35 |
| Regions | 19 compute regions, default iad1, changeable; Pro/Enterprise can set multiple. Vercel states it may transfer data in the US and anywhere its providers operate; region choice is not a residency guarantee | V | S-36, S-37 |
| Attestations | SOC 2 Type 2 for Security, Confidentiality, Availability; ISO 27001:2022; PCI DSS AOC; HIPAA BAA for Pro/Enterprise. The report itself and its scope boundary were NOT read (Trust Center needs access) | V (claims), U (scope) | S-37 |
| Encryption | AES-256 at rest, TLS 1.3 in transit | V | S-37 |
| Plans | Hobby is non-commercial only. Pro: $20/month plus $20 per developer seat, with usage billing. Enterprise: custom | V | S-38 |
| Static IPs / private networking | Secure Compute (Enterprise) gives isolated environments and dedicated egress IPs; needed if a lender allowlists our webhook source | V | S-35, S-37 |
| Background jobs | Functions cap at the durations above; docs point to Vercel Workflows for long jobs. Our outbox delivery is a short leased batch, so a scheduled function fits; detailed cron limits not read | I | S-35 |

Fit conclusion (I): the MVP workload fits Vercel Functions. Constraints to design for: 4.5 MB body (direct uploads), connection pooling, no residency guarantee, and Pro or Enterprise before any commercial use. A lender with a strict residency or private-network requirement would need Enterprise features or a different host. Decision D-008 stands for the pilot; the data store and object store are decided below as options, not choices.

## 2. Data store, keys, model provider (B-118)
| Topic | Finding | Label | Source |
|---|---|---|---|
| Neon Postgres plans | Free; Launch $0.106 per CU-hour; Scale $0.222 per CU-hour; storage $0.35 per GB-month; restore window 6 h (Free), 7 days (Launch), 30 days (Scale), $0.20 per GB-month of history | V | S-39 |
| Neon compliance | SOC 2, SOC 3, ISO 27001, ISO 27701, GDPR, CCPA listed on Scale; HIPAA at extra charge. Attestation scope and report not read | V (claim), U (scope) | S-39 |
| Forced RLS, non-owner role, no BYPASSRLS | These are core PostgreSQL features and our tests run against real Postgres 16. Whether a managed provider lets us create the roles as designed (and under a pooler) is NOT verified | I, U | n/a |
| Point-in-time recovery for the ledger | Needed for lender retention expectations; Scale window of 30 days is shorter than typical record-retention periods, so an export/archival path is required | I | S-39 |
| Per-tenant key management | Our field encryption has a KMS seam but no KMS provider verified; Vercel and Neon pages read do not describe customer-managed keys | U | |
| Claude API retention | Official page: retained data is never used for training without express permission; zero data retention (ZDR) means no storage of prompts or responses at rest after the response, requested through Anthropic sales and enabled per organization; Messages API and PDF support are ZDR-eligible, Batch and Files APIs are not. Default retention windows are on a separate policy page that was NOT read; secondary sources conflict, so no number is stated here | V, U | S-40 |
| Anthropic SOC reports | Claimed in secondary sources only; Trust Center not read | U | |

Cost model (I, from V prices above, assumptions stated): a pilot database on Neon Launch at 0.25 CU average running full month is about 0.25 x 730 x $0.106 = $19 plus storage; Vercel Pro is $20 base plus $20 per developer seat. Model cost per file cannot be stated without the model price page and token counts from a real run (B-124); no number is given. These are list prices for one environment and exclude support, logging, and legal review.

Requires builder approval before acting: any account creation, plan purchase, or sales contact (including requesting ZDR).

## 3. Regulatory follow-ups (B-121)
| Item | Finding | Label | Source |
|---|---|---|---|
| Interagency third-party guidance, 88 FR 37920 | Confirmed: Board, FDIC, OCC; Federal Register vol. 88 no. 111, June 9, 2023, pp. 37920-37937; final as of June 6, 2023; five lifecycle stages (planning, due diligence and selection, contract negotiation, ongoing monitoring, termination); applies to all third-party relationships including fintech; scaled to bank size and risk; guidance, not law | V | S-41 |
| Safeguards Rule, 16 CFR 314 | Section 314.4 requires a qualified individual, written risk assessment, access controls, encryption at rest and in transit, multi-factor authentication, service provider oversight, an incident response plan, and notice to the FTC within 30 days of discovery when 500 or more consumers are affected. Who is covered (FTC-jurisdiction non-bank institutions versus banks, which follow 12 CFR Part 30 Appendix B, S-32) was not established from the pages read, and consumer-focused terms may not map onto business-loan data. Counsel to confirm applicability | V (text), U (applicability) | S-42 |
| Regulation B, 12 CFR 1002.9(a)(3) | Businesses with revenue of $1 million or less: action may be communicated orally or in writing; right to reasons may be disclosed at application. Over $1 million: notice within a reasonable time; written statement of reasons and ECOA notice if requested in writing within 60 days; reasons must be specific principal reasons, and citing only internal standards or a score cutoff is insufficient. Relevant to our rule: the system must never produce a decline reason automatically; the underwriter authors it | V | S-43 |
| CFPB Circular 2022-03 | Secondary sources report it was withdrawn on May 12, 2025 (90 FR 20084) with 66 others; the underlying ECOA/Reg B duties are unchanged (inferred). The CFPB list page itself was not read | U (confirm on CFPB page) | S-44 |
| SR 26-2 OCC and FDIC companions | Secondary sources name OCC Bulletin 2026-13 and FDIC FIL-15-2026; the primary bulletin texts were not read | U | S-45 |
| AICPA Trust Services Criteria | Not retrieved this pass | U | |

Added to LEGAL_REVIEW.md as counsel items: Safeguards Rule applicability; Reg B reasons-statement workflow for declines (design note: reasons are written by the underwriter); residency and subprocessor terms for Vercel, the database host and the model provider.

## Open after this pass
Read Vercel and Anthropic Trust Center reports (needs account access, builder decision); Anthropic default retention policy page; managed-Postgres role/RLS compatibility test (needs an account, so approval); KMS options; AICPA criteria; CFPB withdrawn-guidance page; primary OCC and FDIC bulletins.
