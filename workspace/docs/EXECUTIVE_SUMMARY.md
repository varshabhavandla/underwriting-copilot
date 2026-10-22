# Executive summary: AI-assisted commercial lending underwriting copilot (SBA 7(a) first)

Date 2026-10-22. Status: local MVP on synthetic data with a mock model provider. Nothing is deployed, no real data was used, no lender was contacted. Claims are labeled measured (M), verified from a source (V), or assumed/estimated (E).

## What was built
A TypeScript/Next.js/PostgreSQL application that prepares an SBA 7(a) loan file for a human underwriter and never decides credit.
- Intake form and API, encrypted document storage, per-tenant field encryption of identifiers.
- Extraction through a single model gateway (redaction, budgets, strict schema, citation checked against the source text). Facts are proposals; only verified, validated facts from non-flagged documents are auto-accepted, and accepted means faithfully extracted, not true.
- 11 deterministic, SOP-cited rules for SOP 50 10 8.1 that fail closed, an exception list, and a memo draft whose every line carries a citation and whose figures are checked against the cited source.
- A review console where only an underwriter records approve, decline or return; the database refuses anything else (override required to approve past open critical or high exceptions; a decided case is final).
- A mock servicing adapter behind an interface, fed by a signed, retried outbox after a human decision.
- Database-enforced controls: forced row-level security, append-only decisions, audit and memos, and a hash-chained audit ledger.
- Hardening: request ids, scrubbed logs, rate limits, headers, secret scan, dependency audit and SBOM in CI, a STRIDE threat model mapped to tests.

## Measured results (M; synthetic, mock provider)
- 199 automated tests pass, plus an end-to-end web script with about 50 checks, against a real PostgreSQL.
- Evaluation of 120 packets across 12 file classes (reports/EVALUATION_REPORT.md): 4,030 truth fields; 87.8% accepted and correct, **0 false accepts**, 3.7% held as proposals for a human, 8.4% not extracted (the image-only class, which is routed to manual review because OCR is not built).
- Every planted exception class was detected in 100% of its packets. Over-flagging occurred: the stale-statement and injected-instruction classes raised exceptions beyond the planted one in every packet (reported, not hidden).
- All 120 memos verified and stored; no pipeline run approved, declined or handed off a case.
- Rule constants were re-checked against the SOP 8.1 text on 2026-10-22 (V, ASSUMPTIONS A-18).

## What these results do not show
- The mock provider reads printed labels, and synthetic documents come from the same templates. Accuracy on real documents, real OCR and a real model is unknown. The 0 false accepts validates the verification layers, not a language model.
- Time to decision is an ESTIMATE from guessed per-action durations (assisted/manual ratio 0.19 to 0.50 at mid, with a range that spans above 1.0 at pessimistic assumptions). It is not a time-savings result and must not be quoted as one. A timed baseline by two operators is required (docs/MEASUREMENT_PLAN.md).
- Debt service coverage covers the new loan only and uses a placeholder 9% rate; eligibility, collateral, tax transcripts, personal financial statements and credit reports are not evaluated. 504 and SBA Express are not encoded.

## Honest limitations
Authentication is a local dev identity; rate limiting is per instance; no OCR; no real model; no SAST, signed builds or third-party penetration test; no SOC 2 or vendor review; Vercel fit, data terms and costs are unverified (B-113, B-118). Fair-lending and model-risk positions in docs/FAIR_LENDING_MODEL_RISK.md are engineering analysis, and 19 items need counsel or compliance review (docs/LEGAL_REVIEW.md). No legal advice is given anywhere.

## Top risks
1. Wedge unvalidated: no lender has confirmed the pain or the willingness to pilot; nCino and Parlay contest SBA intake (docs/COMPETITIVE_SCAN.md).
2. Real model accuracy and prompt-injection resistance are unmeasured.
3. Lender and examiner acceptance of AI-assisted files depends on third-party risk review (12 CFR Part 30 Appendix B service-provider oversight) and on SOC 2-type evidence that does not exist yet.
4. SBA rule drift: SOP versions change; the pack must be re-verified on each release.
5. Fair-lending exposure if outputs are ever used to rank or score borrowers; the design forbids it and tests enforce it, but a lender-specific review is needed.

## 90-day plan to a first design-partner lender (requires builder decisions)
- Days 1-30: hold 10 to 15 lender and SBA-processor conversations (B-116) using a synthetic-data demo; run the timed manual baseline with two operators on exported packets (B-131); choose the auth provider (B-117).
- Days 31-60: with approval, integrate one real model provider after reviewing its retention, training, region and SOC terms (B-124); add OCR (B-125); re-run the evaluation and publish real numbers, including failures; verify Vercel or an alternative host and cost (B-113, B-118).
- Days 61-90: replace the placeholder overlay with the partner's policy inputs and add the debt schedule (B-127); gitleaks, SAST, an external penetration test and counsel review of the legal list; a sandbox pilot on the partner's redacted, consented historical files with the partner's underwriters timing both flows.

## Pointers
STATE.md, DECISIONS.md (D-001 to D-025), ASSUMPTIONS.md, SOURCES.md, docs/ARCHITECTURE.md, docs/THREAT_MODEL.md, reports/EVALUATION_REPORT.md.
