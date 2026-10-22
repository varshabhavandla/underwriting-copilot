# NIST AI RMF 1.0 mapping (self-assessment)

Date 2026-10-22. Source: NIST AI 100-1, AI Risk Management Framework 1.0 (January 26, 2023) [V, S-52]: the 72 subcategory identifiers below are from its Tables 1 to 4; the short labels are our paraphrases, not NIST text. Statuses are our judgment, evidence is in this repository, and nothing here is an attestation or certification. The NIST Generative AI Profile (NIST-AI-600-1, July 26, 2024) was not read and is not mapped (B-145). NIST states the AI RMF is being revised [V, S-51], so re-check before relying on this.

## Summary

| Function | ADDRESSED | PARTIAL | GAP | NA | Total |
|---|---|---|---|---|---|
| Govern | 1 | 11 | 7 | 0 | 19 |
| Map | 5 | 9 | 4 | 0 | 18 |
| Measure | 2 | 12 | 7 | 1 | 22 |
| Manage | 1 | 8 | 4 | 0 | 13 |
| **All** | **9** | **40** | **22** | **1** | **72** |

Reading the summary: Govern is mostly organizational (roles, training, leadership, diversity, feedback) and a solo builder with no lender partner cannot honestly claim it. The strongest area is Map and Manage for the design itself (scope, human oversight, component controls). Measure is limited by synthetic data. The largest real gaps are independent assessment, fairness evaluation, production monitoring, incident response and external feedback.

## Subcategory mapping

| ID | Subject (our paraphrase) | Status | Evidence or gap |
|---|---|---|---|
| GOVERN 1.1 | Legal and regulatory requirements for AI understood and documented | PARTIAL | LEGAL_REVIEW.md (22 items), FAIR_LENDING_MODEL_RISK.md, COMPLIANCE_ROADMAP.md; no counsel review yet |
| GOVERN 1.2 | Trustworthy-AI characteristics built into policies and practice | PARTIAL | AGENTS.md boundaries, AGENTIC_LAYER.md, D-019 (accepted means extracted, not true) |
| GOVERN 1.3 | Level of risk management set from risk tolerance | PARTIAL | SR 26-2 scoping in FAIR_LENDING_MODEL_RISK.md; no lender-stated tolerance |
| GOVERN 1.4 | Risk process transparent and documented | PARTIAL | DECISIONS.md (D-001..D-027), THREAT_MODEL.md |
| GOVERN 1.5 | Ongoing monitoring and periodic review planned with roles | GAP | Evaluation harness exists; no review cadence or owners |
| GOVERN 1.6 | AI systems inventoried | PARTIAL | AGENTIC_LAYER.md lists the two AI uses; prompts are versioned (extract-facts@1, draft-memo@1); no formal inventory |
| GOVERN 1.7 | Safe decommissioning of AI systems | GAP | Not designed |
| GOVERN 2.1 | Roles and accountability for AI risk | PARTIAL | Underwriter role enforced in the database; no organization or named risk owners (solo builder) |
| GOVERN 2.2 | AI risk training for personnel and partners | GAP | Organizational; none |
| GOVERN 2.3 | Executive leadership owns AI risk decisions | GAP | Organizational; CEO_PLAN.md asks for the decision |
| GOVERN 3.1 | Diverse team informs AI risk decisions | GAP | Solo builder |
| GOVERN 3.2 | Roles for human-AI configuration and oversight defined | ADDRESSED | Only an underwriter can record a decision, enforced by the database (test/db/review.test.ts); access-model.md |
| GOVERN 4.1 | Safety-first, critical-thinking culture | PARTIAL | AGENTS.md non-negotiables, mutation checks on guards, skeptical-reviewer critique passes |
| GOVERN 4.2 | Risks and impacts documented and communicated | PARTIAL | THREAT_MODEL.md, FAIR_LENDING_MODEL_RISK.md, BENCHMARK.md limits, EXECUTIVE_SUMMARY.md |
| GOVERN 4.3 | Practices for AI testing, incident identification, information sharing | PARTIAL | Test suite and evaluation harness; no incident process |
| GOVERN 5.1 | Feedback from external AI actors collected and considered | GAP | No users yet (B-116) |
| GOVERN 5.2 | Adjudicated feedback incorporated into design | GAP | No feedback channel yet |
| GOVERN 6.1 | Policies for third-party AI, software and data risk | PARTIAL | VENDOR_FIT.md, COMPLIANCE_ROADMAP.md; single model egress (LlmGateway) |
| GOVERN 6.2 | Contingency for failures in high-risk third-party AI | PARTIAL | Provider failure routes files to manual review (pipeline tests); no vendor outage plan |
| MAP 1.1 | Intended purpose, context and settings documented | ADDRESSED | SBA_PROCESS_MAP.md, mvp-workflow.md; intended use (prepare file) and non-use (no credit scoring, no decision) stated |
| MAP 1.2 | Interdisciplinary actors and competencies involved | GAP | Solo builder; no lender, compliance or fair-lending input yet |
| MAP 1.3 | Mission and goals for AI documented | PARTIAL | CEO_PLAN.md, D-006, D-010 |
| MAP 1.4 | Business value defined or re-evaluated | PARTIAL | Hypotheses and an ESTIMATED model only; unmeasured (D-024) |
| MAP 1.5 | Organizational risk tolerances determined | GAP | None from a lender |
| MAP 1.6 | System requirements elicited from AI actors | PARTIAL | Requirements questions in CEO_PLAN.md; no lender input yet |
| MAP 2.1 | Tasks and methods the AI supports defined | ADDRESSED | AGENTIC_LAYER.md: extraction with citations and memo drafting; rules are deterministic code |
| MAP 2.2 | Knowledge limits and human use of output documented | ADDRESSED | D-019, console banner, 'not evaluated' list on every file, EVALUATION_REPORT.md limitations |
| MAP 2.3 | Scientific integrity and TEVV considerations documented | PARTIAL | MEASUREMENT_PLAN.md, EVALUATION_REPORT.md; synthetic data and mock model only |
| MAP 3.1 | Benefits examined and documented | PARTIAL | Labeled estimates only |
| MAP 3.2 | Costs of AI errors examined | PARTIAL | Exception severities and gates; no quantified error-cost analysis |
| MAP 3.3 | Application scope specified | ADDRESSED | Standard 7(a) and 7(a) Small; RULE_PACK.md 'not evaluated' table |
| MAP 3.4 | Operator proficiency processes defined | GAP | No underwriter training or proficiency design |
| MAP 3.5 | Human oversight processes defined and assessed | PARTIAL | Defined and database-enforced; not assessed with real underwriters |
| MAP 4.1 | Legal risks of components and third-party data mapped | PARTIAL | VENDOR_FIT.md, LEGAL_REVIEW.md |
| MAP 4.2 | Internal risk controls for components identified | ADDRESSED | LlmGateway: redaction, budgets, timeout, schema, allowlist, citation check (tests) |
| MAP 5.1 | Likelihood and magnitude of impacts characterized | PARTIAL | Qualitative in FAIR_LENDING_MODEL_RISK.md and THREAT_MODEL.md |
| MAP 5.2 | Regular engagement on impacts with AI actors | GAP | None yet |
| MEASURE 1.1 | Metrics selected for the mapped risks | ADDRESSED | False accepts, exception recall, memo verification, over-flagging (eval:pipeline) |
| MEASURE 1.2 | Metrics and controls reassessed regularly | PARTIAL | Mutation checks each loop; no periodic schedule |
| MEASURE 1.3 | Independent assessors involved | GAP | No independent human review; pen test and lender review pending (B-139) |
| MEASURE 2.1 | Test sets, metrics and tools documented | ADDRESSED | Synthetic generator and 12 classes, EVALUATION_REPORT.md |
| MEASURE 2.2 | Human-subject evaluations meet requirements | NA | No human-subject evaluation run yet |
| MEASURE 2.3 | Performance measured under deployment-like conditions | PARTIAL | Synthetic data, mock provider; real conditions untested (B-124) |
| MEASURE 2.4 | Behavior monitored in production | GAP | Not in production; no model monitoring |
| MEASURE 2.5 | Validity and reliability shown; limits documented | PARTIAL | Limits documented; validity on real documents unknown |
| MEASURE 2.6 | Safety risks evaluated | PARTIAL | Injection class and provider failure behaviors (memo_decide, hallucinate) tested on the mock |
| MEASURE 2.7 | Security and resilience evaluated | PARTIAL | THREAT_MODEL.md, ASVS_SELF_ASSESSMENT.md; no penetration test |
| MEASURE 2.8 | Transparency and accountability risks examined | PARTIAL | Citations, append-only hash-chained audit; no external review |
| MEASURE 2.9 | Model explained and output interpreted in context | PARTIAL | Fact-level citations; no model scoring to explain; real model unevaluated |
| MEASURE 2.10 | Privacy risk examined | PARTIAL | Redaction, field encryption, log scrubbing; no formal privacy assessment |
| MEASURE 2.11 | Fairness and bias evaluated | GAP | No extraction-accuracy comparison across borrower groups; design avoids scoring; analysis only in FAIR_LENDING_MODEL_RISK.md |
| MEASURE 2.12 | Environmental impact assessed | GAP | Not assessed |
| MEASURE 2.13 | Effectiveness of the TEVV process evaluated | PARTIAL | Mutation checks show tests catch guard removal; no external evaluation |
| MEASURE 3.1 | AI risks tracked over time | PARTIAL | BACKLOG.md and THREAT_MODEL.md residual risks |
| MEASURE 3.2 | Tracking where metrics are unavailable | PARTIAL | Estimates labeled ESTIMATED; unknowns listed in STATE.md |
| MEASURE 3.3 | Channels for users and affected parties to report problems and appeal | GAP | None; Reg B reasons workflow open (LEGAL_REVIEW item 21) |
| MEASURE 4.1 | Measurement tied to deployment context with expert consultation | GAP | No lender or domain-expert consultation yet |
| MEASURE 4.2 | Trustworthiness results informed by domain experts | GAP | None yet |
| MEASURE 4.3 | Performance changes tracked with field data | PARTIAL | Evaluation regenerated per run and committed; no field data |
| MANAGE 1.1 | Purpose achievement determined; risks prioritized and responded to | PARTIAL | EXECUTIVE_SUMMARY.md states what is and is not met; BACKLOG priorities |
| MANAGE 1.2 | Risk treatment prioritized by impact and likelihood | PARTIAL | BACKLOG P0 to P2 |
| MANAGE 1.3 | Responses to high-priority risks planned | PARTIAL | THREAT_MODEL.md mitigations and statuses |
| MANAGE 1.4 | Residual risks documented | ADDRESSED | THREAT_MODEL.md residual risks, EXECUTIVE_SUMMARY.md limitations, ASVS gaps |
| MANAGE 2.1 | Resources and non-AI alternatives considered | PARTIAL | Deterministic rules instead of ML scoring; manual baseline planned (B-131) |
| MANAGE 2.2 | Mechanisms to sustain system value | GAP | Not designed |
| MANAGE 2.3 | Respond to and recover from newly found risks | GAP | No incident response plan (also ASVS V16) |
| MANAGE 2.4 | Ability to supersede, disengage or deactivate the AI | PARTIAL | Provider failure degrades to manual review; no operator kill switch |
| MANAGE 3.1 | Third-party risks and benefits monitored | PARTIAL | VENDOR_FIT.md; no ongoing monitoring |
| MANAGE 3.2 | Pre-trained models monitored | GAP | No real model integrated yet |
| MANAGE 4.1 | Post-deployment monitoring including appeal, override and incidents | PARTIAL | Overrides recorded with reasons; no monitoring plan or appeal |
| MANAGE 4.2 | Continual improvement integrated into updates | PARTIAL | Loop discipline: critique, mutation checks, backlog |
| MANAGE 4.3 | Incidents and errors communicated and tracked | GAP | No process |

## Gaps to close first (all needing the builder or a partner)
1. Independent assessment and penetration test (MEASURE 1.3, 2.7).
2. Fairness and bias evaluation plan with counsel and a lender (MEASURE 2.11, MAP 5.1, GOVERN 1.1).
3. Incident response, vendor-outage and disengage procedures (MANAGE 2.3, 2.4, 4.3, GOVERN 6.2).
4. Feedback and appeal channels once real underwriters and borrowers exist (GOVERN 5, MEASURE 3.3).
5. Real-model evaluation and monitoring (MEASURE 2.3, 2.4, MANAGE 3.2).
