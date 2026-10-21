# SBA 7(a) / 504 process map (B-101)

Status: SBA portion done from SOP 50 10 8.1 primary text (loops 2-3). Conventional SME is in docs/CONVENTIONAL_SME_PROCESS.md.
Not legal advice. Labels: [V] verified in cited source, [I] inferred by us, [A] assumed.
SOP = SBA SOP 50 10 8.1, effective October 1, 2026 (S-1). Paragraph references are to the SOP text we parsed from the
official .docx (S-2); page numbers not recorded, so cite by section/appendix names. Re-check SOP on every SBA notice.

## 1. Programs in scope
- [V] Standard 7(a): loans over $350,000, maximum $5,000,000. 7(a) Small: up to $350,000. SBA Express: up to $500,000, lender-delegated (S-1, S-3).
- [V] Processing: non-delegated (lender submits application and documents to SBA via the SBA Loan System; SBA decides eligibility and creditworthiness) or PLP delegated (lender decides, SBA does not review the analysis beforehand, lender must document the file; reviewed at guaranty purchase or oversight) (S-2, Std 7(a) ch. "Processing Methods").
- [V] 504: CDC-delivered fixed-asset program; project must meet an economic development objective (e.g. one job per $95,000 SBA-guaranteed, $150,000 for small manufacturers/energy goals) (S-2, Section C ch.1).
- [V] Credit standard: cash flow is the primary repayment source; if analysis shows no reasonable assurance of repayment from cash flow, the request must be declined regardless of collateral (S-2, Std 7(a) credit standards).
- [A] Wedge scope for MVP: Standard 7(a) and 7(a) Small file preparation. 504 and Express later.

## 2. Lifecycle, with automation classification
Class: A = software can do it; AH = AI/software prepares, human verifies; H = human only (judgment, attestation, or decision).

| # | Step | What the SOP requires (summary) | Class |
|---|---|---|---|
| 1 | Inquiry / lead | No SOP-specific rule; lender business process | A (minimal CRM later) |
| 2 | Eligibility pre-screen (SBA now makes the eligibility determination, see section 8) | Operating for-profit business in US; small under SBA size standards (incl. affiliation); not an ineligible type (lending, passive, speculative, etc.); no prior loss to government or delinquent federal debt (CAIVRS access noted); citizenship/residency of owners; franchise brand on SBA Franchise Directory (S-2, Sec. A ch.1) | AH (checklist + evidence), final eligibility H |
| 3 | Application intake | SBA Form 1919 per co-borrower, signed by authorized rep; ownership of 100% listed and percentages sum to 100%; Form 1919 jobs data (S-2, App. 20) | A (completeness and arithmetic), signature validity H |
| 4 | Document collection | See section 3 | A (tracking, chasing), AH (reading) |
| 5 | Verification | Tax transcripts (Form 4506-C or 8821) obtained and discrepancies reconciled (7(a), before first disbursement; not required for Express disbursement but follow-up needed); credit reports on owners/guarantors; two months bank activity on primary operating account (7(a) Small/Express) (S-2, Sec. A ch.5 Para. B; Sec. B ch.2) | AH |
| 6 | Credit analysis | Historical 3 years + interim; EBITDA with justified adjustments; DSC; global cash flow; pro forma balance sheet; ratios; working capital; collateral; insurance; refinance justification (S-2, Std 7(a) "Lender's Credit Analysis") | AH: spreading and ratio math are A; judgment on adjustments, projections, management quality is H |
| 7 | Credit memorandum | Must address history of business, repayment ability, credit elsewhere test, working-capital rationale (50 percent or more of proceeds), competition, seller financing, litigation, franchise, change-of-ownership valuation, recommendation rationale (S-2) | AH: AI drafts with citations; underwriter owns content |
| 8 | Credit decision | Lender (PLP/Express) or SBA (non-delegated) decides | H (hard constraint D-001) |
| 9 | Submission / loan number | Submit via SBA Loan System; non-delegated attachments; uploads over 250MB split (S-2, App. 20) | A (package assembly), submission action H-approved |
| 10 | Closing and disbursement | SBA terms and conditions, equity injection verification, closing docs (S-2, Sec. B ch.6) | AH, out of MVP |
| 11 | Servicing handoff | Lender system | A via adapter (MVP: mock) |

## 3. Required documents and freshness rules (feeds the checklist engine)
All [V] from S-2 Appendix 20 and Std 7(a)/7(a) Small chapters unless noted.
- SBA Form 1919 per co-borrower, signed. Credit memorandum (lender-authored).
- Owner financial statement (SBA Form 413 or lender equivalent) for owners of 20 percent or more and proposed guarantors: signed and dated within 90 days of submission.
- Business financial statements: dated within 120 days of submission.
- Existing business: 3 years business financial statements or tax returns, plus interim statements, for applicant and affiliates; year-end balance sheet with detailed debt schedule and P&L for 3 years; interim balance sheet with debt schedule and interim P&L.
- Start-up/projection-based: detailed projections with assumptions showing DSC of at least 1.15 within 2 years of funding (Standard 7(a)).
- Tax transcripts per Sec. A ch.5 Para. B (Forms 4506-C or 8821).
- Personal credit reports on owners/guarantors; for non-delegated loans a report dated within 90 days is included in the submission.
- Conditional: lease; equipment list with quotes; collateral list; franchise documents; management agreement; real estate (appraisal, signed purchase agreement, environmental questionnaire, cost breakdown); change of ownership (buy-sell agreement, business valuation, seller 3-year financials dated within 120 days, pro forma); debt refinancing (notes, security agreements, 12 months of transcripts proving the debt is current); proof of status for each US National.
- 7(a) Small/Express: two most recent months of bank statements for the primary operating account; last year-end financial statement dated and received within 120 days of year end, or 12-month projections showing DSC of at least 1.10 within one year (not for change of ownership).
- 504 (CDC): balance sheet and income statement within 120 days, A/R and A/P aging, debt schedule, government financing schedule, affiliate financials, Form 4506-C or 8821, status of US Nationals; transcripts and full financial verification not required until closing.

## 4. Quantitative rules the engine can compute (all [V], S-2)
- DSC at least 1.15 historical and/or projected, and at least 1.0 global (Standard 7(a)). 7(a) Small/Express: no reduced standard solely because of loan size (the SOP states the Appendix 15 DSC requirements apply).
- Start-up (1 year or less of revenue): equity injection of at least 10 percent of total project costs. Loans approved more than 90 days apart are separate projects.
- Standby debt counts as equity only if on full standby (no principal or interest payments for the loan term).
- Variable-rate caps for Standard 7(a): Prime or SBA Optional Peg + 6.5 percent up to $50,000; +6.0 percent to $250,000; +4.5 percent to $350,000; +3.0 percent above $350,000. Fixed maximum comes from an SBA page not yet fetched.
- Loan maximum applies to applicant plus affiliates combined.
- Guarantee percentages (S-3): 75 percent Standard; 85 percent to $150,000 and 75 percent above for 7(a) Small; 50 percent SBA Express. Appendix 16 governs; engine should cite it, not hard-code from a summary page.

## 5. Common exceptions the engine should detect (derived [I] from the rules above)
1. Missing required document or stale document (date beyond 90/120 days).
2. Ownership percentages do not total 100 percent, or an owner of 20 percent or more has no personal financial statement.
3. Affiliate not disclosed, or combined loan exceeds the maximum.
4. Tax return figures differ from financial statements or from transcript (reconciliation required).
5. DSC below threshold; unjustified add-backs; owner draws and S-corp distributions unexplained.
6. Debts on bank statements absent from the debt schedule (the SOP says bank activity is reviewed for exactly this).
7. Late payments on debt to be refinanced in the last 12 months without explanation.
8. 50 percent or more working capital without rationale.
9. Franchise brand not on the Directory; management agreement suggesting passive business.
10. Start-up with equity injection under 10 percent, or equity source not eligible.
11. Document content that looks like instructions (injection tripwire, see AGENTS.md).

## 6. Human-only items (must stay human)
Final credit decision and approval authority; eligibility determinations; attestations and signatures; adjustments and assumptions in cash-flow analysis; waivers and exceptions to policy; any customer communication of a decision; IRS authorization signatures.

## 7. Limits of this document
- We did not read every SOP appendix (e.g. Appendices 14, 15, 16, 19 not yet parsed). Change of ownership and collateral rules are therefore incomplete.
- SOP paragraphs were extracted by script from the .docx; table content may be missing or reordered. Verify against the published document before encoding any rule.
- SBA versions change often; SOP 50 10 8.1 became effective only on 2026-10-01 and a procedural notice already amended 8 in March 2026 (S-4, search summary only).

## 8. Correction and additions from loop 3

**Who determines eligibility [V, S-12].** SBA states that since August 1, 2023 it "is responsible for determining eligibility for all loans based on ETRAN data submissions", conducts "fraud reviews on every loan application", checks affiliation on ownership only, and that lenders "must continue to comply with FinCen BSA/KYC requirements". Consequence for us: our eligibility step is a lender-side pre-screen that must submit correct data, not a determination. Step 2 above is relabeled accordingly. The lender still owns credit analysis, documentation and (for PLP) the credit decision, and SBA can review that analysis at guaranty purchase (S-2).

**Guaranty limits [V, App. 16].** Maximum SBA guaranty outstanding to one business and affiliates: $3,750,000. Maximum percentage: 85 percent for loans of $150,000 or less, 75 percent above. Multiple 7(a) loans approved within 90 days are combined for the percentage test. SBA Express: 50 percent. 7(a) plus 504: the 7(a) is processed and approved first.

**Maturity [V, App. 17].** Working capital, inventory and intangibles: up to 10 years. Equipment: generally up to 10, up to 15 if IRS useful life supports it. Real estate: up to 25. Leasehold improvements: 10 plus up to 12 months. Mixed use: blended, or real-estate maturity if 51 percent or more is real estate. 7(a) loans must have stated amortization and no balloon (App. 15 for change of ownership).

**Refinancing [V, App. 14].** Proceeds may not pay a creditor in a position to sustain a loss; debt must have been current for at least the last 12 months unless an exception applies. New installment payment must be at least 10 percent lower in aggregate. Same-institution debt: 36 months of payment transcript and a written explanation of any payment later than 29 days. Merchant cash advances only if converted to a term loan and amortized 24 months. Factoring agreements not eligible. Itemize each creditor paid $10,000 or more. Written refinance analysis and supporting notes/statements required (credit memo not required for Small/Express).

**Collateral [V, App. 19].** "Fully secured" test for Standard 7(a) uses haircuts: new machinery and equipment 75 percent of price less prior liens; used M&E 50 percent of net book value (80 percent with orderly liquidation appraisal); improved real estate 85 percent and unimproved 50 percent of market value; furniture and fixtures 10 percent; trading assets 10 percent of current book value if taken. Collateral shortfall: take available personal real estate equity, except no lien required where equity is under 25 percent of fair market value; no lien required on vehicles under $20,000 or already liened. No collateral required for 7(a) Small or Express loans of $50,000 or less. Appraisal: USPAP, independent, dated within 12 months of application, state-certified if value exceeds $1,000,000, lender as client. If appraised value is under 90 percent of the estimate the lender may not close without SBA permission (PLP lenders may with written justification). A loan is not declined solely for inadequate collateral. No piggyback structures. Transfers within 36 months need an additional appraisal review or site visit.

**Change of ownership [V, App. 15, partial].** Business valuation by a Qualified Source requested by the lender (lender may self-value when purchase price is $350,000 or less unless buyer and seller are closely related); lender verifies valuation inputs against the seller's IRS transcripts; Quality of Earnings report required at a purchase price of $3 million or more and its earnings must be used for DSC; debt supporting the deal limited to the valuation; seller earnouts prohibited; seller generally may not remain as officer, director, owner or employee, with exceptions; site visit required; seller note refinanceable only after 36 months in place and current. Equity-injection percentages and other App. 15 tests are not yet encoded; read App. 15 in full before building that rule pack.

## 9. New engine rules this adds (all need SOP section + version before shipping)
DOC-90/120-day freshness; guaranty percentage and $3.75M cap with affiliate and 90-day aggregation; maturity by use of proceeds; refinance 10 percent payment improvement and 12/36-month current tests; collateral haircut calculator and shortfall flag; appraisal age (12 months), certification threshold ($1M), and 90 percent value tripwire; QoE trigger ($3M); valuation self-performance threshold ($350k). Math rules are deterministic code; judgment items (credit elsewhere, adequacy of add-backs, closeness of buyer/seller) stay human.
