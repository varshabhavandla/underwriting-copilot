# Plan for the CEO: AI-assisted commercial loan file preparation

Status 2026-10-22. Working local demo on synthetic data. Claims are labeled: measured (M), verified from a source (V), estimated (E), or open (O). No real borrower data, no real lender system, nothing deployed.

## 1. The business case in one paragraph
Commercial loan files, SBA 7(a) first, take underwriter time on document handling: reading statements, keying figures, cross-checking, applying program rules and writing the memo. The application prepares that file (extracted facts with sources, rule checks against the SBA SOP, exceptions, a drafted memo) so the underwriter spends time on judgment. The underwriter makes every credit decision; the tool is built so it cannot. Whether this saves time or money is unproven (O): the only time figures so far are estimates built on assumed durations (E), and the plan below replaces them with measurements.

## 2. What exists today
- M: working intake, extraction with citations, 11 SBA rules, exception list, verified memo draft, review console with a database-enforced human decision gate, audit trail, mock servicing handoff. About 200 automated tests pass, including a real-database end-to-end run.
- M: on 120 synthetic packets (mock model, 12 file types) 87.8% of 4,030 fields were accepted and correct, 0 were falsely accepted, every planted problem type was detected; the tool also over-flagged in two classes. This validates the checking layers, not a language model on real documents.
- E: estimated assisted-to-manual time ratio 0.19 to 0.50 at mid assumptions, but the pessimistic range exceeds 1.0. Not a result.
- O: real model accuracy, OCR, real documents, real underwriter time, a real identity provider (sign-in itself is built and tested with a stand-in), hosting, and any lender's policy.

## 2b. How we compare to the leading products (detail: docs/BENCHMARK.md)
We cannot claim to outperform any incumbent today: no head-to-head test has been run. Incumbents (nCino, Abrigo, Baker Hill, Moody's, Ocrolus) have scale, SBA forms and E-Tran integration, attestations such as SOC 2 Type 2, and years in production; we have none of those. Where our design differs and can be checked: every fact cited to a page and quote, memo figures machine-checked against sources, SOP-section-cited rules, a database-enforced human decision gate, a tamper-evident audit log, and a published evaluation that includes failures. To earn a "better" claim we will pre-register targets and run a blind head-to-head on the same files (BENCHMARK.md section 5), and publish the result either way.

## 3. How it fits the business (to be confirmed)
Value hypotheses, each testable: shorter time to a decision-ready file; fewer missed document or consistency problems; a consistent, cited record for audit and exam readiness; faster borrower response. Costs and risks: model and hosting fees (unquantified until a real run), integration effort, third-party risk review by the lender, fair-lending and model-governance review, change management for underwriters.

## 4. Requirements we must confirm with you (we do not assume them)
1. Which lending lines first (SBA 7(a) only, 504, Express, conventional SME)? Annual volume and average files per underwriter per week?
2. What outcome defines success: cycle time, capacity per underwriter, error rate, borrower experience, cost per file? Target and deadline?
3. Where do files and decisions live today (loan origination system, document store)? Which integration is mandatory?
4. Policy: the lender's own credit overlays, pricing, and existing-debt method (the demo uses a placeholder).
5. Risk appetite: is a cloud-hosted vendor acceptable? Data residency, model provider and retention requirements? Who owns vendor-risk approval?
6. Governance: who signs off on model and rule changes; examiner expectations; fair-lending review owner.
7. Budget range, pilot sponsor, and which underwriters will pilot.
8. Anything you require that this demo does not show.

## 5. Plan (90 days, with decision gates)
| Phase | Work | Needs from you | Exit gate |
|---|---|---|---|
| Days 1-30 | Walk the demo; confirm requirements above; timed baseline of the current manual process on synthetic packets by two underwriters; choose the identity provider (sign-in is built against the open OpenID Connect standard) | Sponsor, 2 underwriters for a few hours, answers to section 4 | Written requirements and a measured manual baseline |
| Days 31-60 | With approval, connect one real model provider after reviewing its data terms; add OCR; re-run the evaluation and report real numbers including failures | Approval for a vendor account and spend; security contact | Real accuracy report; go/no-go |
| Days 61-90 | Pilot on redacted, consented historical files with the lender's own policy inputs; underwriters time both flows; external security test and counsel review | Lender partner, legal and compliance reviewers | Measured time and quality comparison; decision to continue |

Stop conditions: any false accept of a figure that reaches a decision unflagged; failure to beat the manual baseline on measured time; a vendor or regulatory requirement that cannot be met.

## 6. Risks (top)
1. Value unproven until measured. 2. Real model behavior and prompt-injection resistance unmeasured. 3. Third-party and model-risk expectations of lenders (V: 88 FR 37920 applies to bank relationships with vendors; SR 26-2 replaced SR 11-7 and is aimed at banks over $30 billion). 4. Rule drift as SBA changes the SOP. 5. Fair lending if the tool were ever used to score or rank borrowers; by design it does not. Items needing counsel are in docs/LEGAL_REVIEW.md. This plan is not legal advice.

## 7. Decisions we are asking for
Approve the requirements discussion; nominate two underwriters for the baseline; approve in principle the Days 31-60 vendor spend, to be itemized first.
