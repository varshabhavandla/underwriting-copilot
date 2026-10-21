# Compliance roadmap and lender questionnaire draft (B-205)

Labels: [V] verified, [S] secondary, [I] inferred. We hold NO certifications and have NO audit reports. Never claim otherwise.

## 1. What a bank customer will expect (and why)
- **GLBA safeguards via the bank's guidelines [V, S-32].** The Interagency Guidelines (12 CFR Part 30 App. B for national banks; parallel texts at other agencies) require a bank to exercise "appropriate due diligence in selecting its service providers", to "require its service providers by contract to implement appropriate measures", and, where its risk assessment indicates, to "monitor its service providers", including reviewing "audits, summaries of test results, or other equivalent evaluations". Objectives: confidentiality and security of customer information, protection against threats, against unauthorized access, and proper disposal. The board receives at least annual reporting. For us this means: contract terms, evidence, and ongoing reports. The FTC Safeguards Rule (16 CFR 314) applies to non-bank financial institutions; we did not verify its text.
- **Third-party risk management [S, via search summary of the 2023 interagency guidance].** Planning, due diligence, contract negotiation, ongoing monitoring and termination; proportionate to risk; contracts typically give audit and remediation rights including subcontractors; banks keep an inventory of third parties and flag critical activities. Primary text: Federal Register 88 FR 37920 (not read).
- **Model risk [V, S-28].** See docs/FAIR_LENDING_MODEL_RISK.md.
- **SOC 2 reports [S].** A Type 1 report tests control design at one date; a Type 2 tests operating effectiveness over a period, commonly 3 to 12 months; both use the AICPA Trust Services Criteria with Security as the baseline and others (availability, confidentiality, and so on) by scope; many buyers expect Type 2. Sources were vendor guides; the AICPA text was not read. Audit cost not verified.

## 2. Staged path (what to build now versus later)
| Stage | When | Build | Evidence produced | Claim allowed |
|---|---|---|---|---|
| 0 Design for audit | Now to MVP | Tenant isolation tests, append-only audit ledger, versioned rules and prompts, least-privilege access, CI checks, no real data | Repo, CI logs, tests, design docs | "Designed to support audit evidence." No certification language |
| 1 Security program | Before any real borrower data | Written policies (access, change management, incident response, vendor management, data retention and disposal, backup), risk assessment, MFA, logging and alerting, backup restore test, external penetration test, vendor inventory with each vendor's reports | Policies, test report, vendor reviews | "Independent penetration test completed on <date>" once true |
| 2 Readiness and Type 1 | After first design-partner commitment | Select a compliance automation tool and an auditor (prices to verify), gap assessment, evidence collection, Type 1 report | Type 1 report | "SOC 2 Type 1 report available" once issued |
| 3 Type 2 | Observation window after Stage 2 | Operate controls with evidence for the window; remediate exceptions | Type 2 report | "SOC 2 Type 2 report (period X to Y)" once issued |
| 4 Expand | By demand | Additional criteria, ISO 27001 if customers ask, privacy program | Reports | Only what is held |
Build-now principle: controls that are cheap at the start and costly to retrofit: tenant isolation, audit trail, encryption design, access model, change control. Defer tooling subscriptions and audits until a lender relationship justifies them.

## 3. Draft answers to common lender vendor-security questions
Status key: TRUE TODAY, PLANNED, NOT IN PLACE. Answers are drafts for the builder to confirm; do not send without review.
| Question | Draft answer | Status |
|---|---|---|
| Do you hold SOC 2, ISO 27001 or similar? | No. We follow the staged plan in this document; a Type 1 is targeted after the first design-partner commitment. | NOT IN PLACE |
| Do you use customer data to train models? | No. We do not train or fine-tune on customer data. Provider-side terms are being verified before any real data is used. | TRUE TODAY (design); provider terms PLANNED |
| Where is data hosted and can it be pinned to a region? | Planned US region(s); hosting and database vendors not yet selected; no production environment exists. | PLANNED |
| How is customer data isolated? | Tenant identifier from the verified session; forced row-level security in the database, application role without bypass; object storage under tenant prefixes with per-tenant keys. Tested as the app role, with positive controls. | PLANNED (reference implementation and tests exist for the contract in code) |
| Encryption at rest and in transit? | TLS in transit; encryption at rest with per-tenant keys by design; field-level encryption for sensitive identifiers. | PLANNED |
| How do you handle AI risks such as prompt injection? | Documents are treated as untrusted data; model calls have no tools and no write access; outputs are schema-checked and citation-verified; humans decide. Adversarial tests run on every change. Not a guarantee. | PARTIAL: design and a basic tripwire exist |
| Does AI make credit decisions? | No. An authorized underwriter records every decision; the system prepares files and flags exceptions. | TRUE TODAY (enforced in code and tests for the decision gate) |
| Audit trail? | Append-only, hash-chained event log of documents, facts, rules fired (with SOP version), model calls and human decisions. | PLANNED (design); decision record exists in reference store |
| Access control and MFA? | Role-based; staff access through SSO with MFA once an identity provider is selected; least privilege; no shared accounts. | PLANNED |
| Secure development practices? | CI with tests on every change; secret scanning, dependency audit, SAST, SBOM planned; builder review recorded for sensitive paths. We do not claim SSDF conformance. | PARTIAL |
| Penetration testing? | Not yet performed; planned before any real data. | NOT IN PLACE |
| Incident response and breach notification? | Written plan and customer notification terms to be agreed in contract; not yet written. | NOT IN PLACE |
| Business continuity and backups? | Planned: point-in-time recovery and tested restores. | PLANNED |
| Subprocessors? | Will be listed per customer: hosting, database, storage/keys, identity, AI/OCR providers, logging. Not yet selected. | PLANNED |
| Employee screening and training? | One person today; no formal program. | NOT IN PLACE |
| Data retention and deletion? | Per-contract retention; deletion by tenant key revocation and record purge; policy not yet written. | PLANNED |
| Independent validation of models? | Evaluation report with versions and results provided to the lender; independent validation is the lender's call. | PLANNED (B-308) |

## 4. Needs legal or compliance review
See docs/LEGAL_REVIEW.md items 1-17. New in this loop: whether our LLM components fall within a lender's model inventory despite SR 26-2 footnote 3 (16); outcome-data export for the lender's disparate-impact testing (17); contract terms for GLBA service-provider obligations and audit rights (18); status of CFPB circulars (19).
