# Benchmark: top underwriting software, best practices and security (B-114)

Date 2026-10-22. Labels: [V] stated on the cited public page (S-numbers in SOURCES.md); [C] company claim, unverified; [I] our inference; [T] true of our code and covered by a test or eval in this repo. A page not stating a feature is not proof the product lacks it; vendor trust pages were read only where noted. No vendor was contacted, demoed, or purchased from.

## 1. What "better than top organizations" can honestly mean
We cannot claim to perform better than any vendor today. The comparison that would prove it (same files, blind underwriters, measured error and time) has not been run, we have no access to incumbent products, and our results come from synthetic data and a mock model. Incumbents also have things we lack entirely: customers at scale, certifications, integrations, support and years of production hardening.
What we can do is (a) hold ourselves to named external standards, (b) be specific about design properties that are stronger than what incumbents publicly describe, each checkable in our code, and (c) set pre-registered targets and publish the head-to-head result either way. Section 5 is that protocol.

## 2. Capability benchmark (public claims versus ours)
| Product | What it publicly claims | Our position |
|---|---|---|
| nCino SBA Solution and Credit Analysis [V, S-16, S-17] | SBA forms via DocuSign, workflow rules, E-Tran submission, automated spreading, credit memo generation from platform data | Behind: no forms, E-Tran, spreading, or LOS. Ahead on nothing here; different layer |
| Parlay with nCino [V, S-18] | AI-native SBA intake and eligibility screening, handoff into nCino; "up to 80 percent" less manual work, unnamed customers [C] | Not competing at intake. No measurement of ours supports any percentage |
| Abrigo Sageworks SBA [V, S-47] | Produces SBA forms 1919 and 1920, E-Tran integration through its API network, SBA loans decisioned on the same platform. Page makes no claim on SOP compliance checks or credit memo generation | Behind on forms and integration. A possible differentiator is SOP-section-cited rule checks (the page does not mention them, which is not proof they are absent) |
| Baker Hill [V, S-48 search summary] | Commercial origination including SBA 7(a), PLP, Express and CAPLines, credit memo tools; a customer case claims credit memo creation time improved by upwards of 25 percent [C] | Behind on breadth. Their 25 percent is a vendor-published case, not a benchmark |
| Moody's agentic credit memo [V, S-46] | Coordinated AI agents draft memos from proprietary data, financials and web sources "in minutes", "transparent, clearly sourced"; page does not say how statements link to sources, makes no audit-trail or accuracy claims | Our memo lines each carry a citation to a stored source passage and every number is machine-checked against it [T: memo tests, eval]. Moody's data foundation (590 million entities [V]) is far beyond us |
| Ocrolus [C, S-21; V, S-49] | Document extraction with human QC; claims over 99 percent accuracy without a stated method [C] | Behind: we have no OCR and have not run a real model. Candidate component to integrate |
| Zest AI, Taktile [C/V, S-19, S-20] | ML credit models with explainability and fair-lending reports; low-code decision engine | We deliberately do not score credit; rules are deterministic and cited |

Where our design is different, and checkable ([T]): every extracted fact has a page and quoted passage or it is not stored; accepted facts are labeled as faithfully extracted, not true; memo figures are verified against cited sources and a draft that fails is never stored; each of 11 rules names its SOP section and fails closed; the pipeline cannot set a case to approved or declined, and the database rejects it; the tool lists seven things it did not evaluate; the evaluation report publishes false accepts, over-flagging and unextracted share. We found no incumbent page that makes all of these statements, but pages are marketing, so this is a hypothesis about the market, not a finding.

## 3. Security benchmark
Public statements read: Abrigo footer lists SOC 1 Type 2 and SOC 2 Type 2 [V, S-47]; Ocrolus portal lists SOC 2 (type not stated), SOC 3, ISO 27001, PCI DSS, a penetration-test report, CSA STAR Level 1, a BitSight rating of 760, TLS grades of A+, and subprocessors including OpenAI, Snowflake, Google Cloud and AWS, with encryption methods and retention periods not stated [V, S-49]; Moody's credit memo page makes no security claims [V, S-46]; nCino's security page URL tried returned 404 and was not read.

| Control | Typical incumbent public posture | Ours today |
|---|---|---|
| Independent attestation (SOC 2 Type 2, ISO 27001) | Listed by Abrigo and Ocrolus | None. Behind. Plan in COMPLIANCE_ROADMAP.md (Stage 1 evidence pack, then SOC 2) |
| Penetration test | Report listed (Ocrolus) | None. Behind. Needs budget and approval |
| Tenant isolation | Not described in pages read | Forced row-level security on every table, non-owner role without BYPASSRLS, positive-control tests [T] |
| Human-decision enforcement | Described as workflow or review in marketing | Enforced by database triggers and policies, not by screens [T] |
| Tamper evidence | Not described in pages read | Append-only tables and hash-chained per-tenant ledger with a verify function [T] |
| Identifier protection | Encryption methods not stated by Ocrolus | Per-tenant AES-256-GCM field encryption, last four only, redaction before any model call, scrubbed logs [T]; key custody is a local provider, KMS planned, so weaker in custody than a managed service |
| Prompt-injection handling | Not described in pages read | Document text is data; injection flag blocks auto-acceptance; model has no tools or write path; measured against the mock only [T], untested on a real model |
| Supply chain | Not described | Dependency audit and SBOM in CI, pattern secret scan; no signing, SAST or provenance |
| Authentication and sessions | Present in production products | Not built (development identity only). Behind |
| Availability, DR, monitoring, support | Present (Ocrolus lists a 4-hour RTO [V]) | None. Behind |

## 4. Standards we hold ourselves to (self-assessment, not certification)
OWASP ASVS 5.0.0 (May 2025) has 17 chapters; the counts we could read for V1 to V15 are 70 level-1, 160 level-2 and 86 level-3 requirements, 316 in total, with V16 (logging) not fully read [V, S-50]. A requirement-level self-assessment now exists (ASVS_SELF_ASSESSMENT.md, 253 level 1 and 2 requirements: 65 met, 41 partial, 2 not met, 89 deferred to authentication and hosting, 55 not applicable, 1 not assessed); the chapter-level view below is the earlier summary.
| ASVS chapter | Status |
|---|---|
| V1 Encoding, V2 Validation and business logic | Partial to strong: parameterized queries, schema validation, business invariants in the database |
| V3 Web frontend | Partial: baseline headers; no nonce-based script policy yet (B-133) |
| V4 API | Partial: single wrapper with rate limit, content-type and size guards, generic errors |
| V5 File handling | Strong for MVP: content-based type check, size cap, encrypted store, hostile files routed to manual review |
| V6 Authentication, V7 Session, V9 Tokens, V10 OAuth/OIDC | Not built (B-117) |
| V8 Authorization | Strong at the data layer (row-level security, role gates); depends on real identities |
| V11 Cryptography | Partial: AES-256-GCM per tenant; key management is a local stand-in |
| V12 Secure communication, V13 Configuration | Partial: HSTS header, validated environment, no secrets in repo; TLS and hosting settings depend on deployment |
| V14 Data protection | Partial to strong: encryption, minimal clear text, no identifiers in logs |
| V15 Secure coding and architecture | Partial: tests, mutation checks, SBOM, threat model; no SAST |
| V16 Logging and error handling | Partial: structured scrubbed logs, request ids, audit ledger; no alerting or retention policy |
Other references used: OWASP LLM Top 10 (2025) and 12 CFR Part 30 Appendix B (S-31, S-32); NIST SSDF SP 800-218 (S-31); interagency third-party guidance 88 FR 37920, whose lifecycle a lender will apply to us (S-41); SR 26-2 (S-33). NIST AI RMF 1.0 (January 26, 2023, with a Generative AI Profile of July 26, 2024, and under revision [V, S-51]) is now mapped in NIST_AI_RMF_MAPPING.md (72 subcategories: 9 addressed, 40 partial, 22 gap, 1 not applicable); the Generative AI Profile is not yet mapped (B-145).

## 5. Protocol to test "better" (needs your approval and, for incumbents, access)
1. Pre-register targets before running anything. Proposed targets, not results: 0 false accepts on a held-out packet set; at least 95 percent recall on planted exception classes with a stated false-positive ceiling; 100 percent of memo figures matching cited sources; every decision traceable to a named underwriter.
2. Same packets for every system under test: our harness on redacted or synthetic packets, plus any incumbent that a lender partner or the vendor lets us run (sandbox or demo with the same files). Where we cannot run a product we report "not tested", never an assumed score.
3. Blind human review of outputs, and timed underwriter runs for both flows (docs/MEASUREMENT_PLAN.md).
4. Publish the table with failures, including cases where an incumbent wins.
5. Security: independent penetration test, then SOC 2 readiness, and a lender-style due-diligence questionnaire answered from evidence.

## 6. Priority gaps to close (added to the backlog)
Authentication (B-117); real model plus OCR and rerun of the evaluation (B-124, B-125); penetration test and SOC 2 path (B-139); managed key custody (B-140); SBA form generation and E-Tran-style export, only if lenders ask (B-141); NIST AI RMF mapping (B-138); requirement-level ASVS self-assessment (B-142); read the remaining vendor trust pages (B-114 remainder).
