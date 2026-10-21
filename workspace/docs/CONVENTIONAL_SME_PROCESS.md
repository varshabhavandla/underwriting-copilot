# Conventional SME lending process map (B-101 remainder)

Labels: [V] verified in a cited source, [I] inferred, [A] assumed. Not legal advice.
Limit: no single current regulator document describes a conventional SME workflow. The best primary source found is old, so this is a
structural outline to validate with a lender, not a rule set.

## Sources and their limits
- OCC Comptroller's Handbook, Commercial Loans (Section 206) [V, S-13]: narrative dated March 1990, procedures March 1998; reputation-risk
  references removed March 2025 per OCC Bulletin 2025-4 (as stated on its cover). Dated, but still the OCC's description of what examiners check.
- Reg B (12 CFR 1002) notifications [V via summary, S-5]; CFPB small business lending rule (section 1071) [V via search summary, S-14].
- SBA SOP 50 10 8.1 [V, S-2] is stricter than conventional practice in places and is our best concrete checklist; a lender's conventional
  policy will usually be its own document.

## What examiners check in commercial credit files [V, S-13, examination procedures]
1. Board-approved lending policy covering: acceptable risks and concentrations, procedures for reviewing applications, standards for credit lines,
   acceptable collateral, loan-to-value parameters, minimum verification of borrower assets, minimum documentation standards, and risk monitoring.
   Policies are reviewed and approved by the board at least annually.
2. Credit file contents and quality: analyses, memoranda, mercantile reports, field audit reports, credit checks, correspondence.
3. Borrower financial analysis: balance sheet and P&L trends across current and prior statements; reasonableness of each balance sheet item;
   contingent liabilities; for seasonal lines, whether the trade cycle supports a clean-up; for term loans, whether payment terms fit the asset
   and operating cash flow covers scheduled amortization; secondary support from guarantors.
4. Collateral: eligible/ineligible receivables, perfection of first liens, inspections and appraisals, control of collateral and proceeds.
5. Exceptions: internal exception reports for credit and collateral exceptions.
6. Cash flow is the primary repayment source; collateral and refinancing are not substitutes [V from OCC handbooks via search summary, S-15; verify wording].

## Steps and automation class (A = software, AH = AI/software prepares and human verifies, H = human only)
| Step | Notes | Class |
|---|---|---|
| Application and document collection | Lender-defined; same artifacts as SBA minus SBA forms | A |
| KYC/BSA, OFAC, beneficial ownership | Lender compliance programs; vendor and lender responsibilities need counsel | AH, H for sign-off |
| Spreading and ratio analysis | Historical statements, DSC, leverage, liquidity | AH |
| Collateral valuation and lien checks | Appraisals, UCC searches | AH |
| Credit memorandum | Lender template | AH |
| Approval | Authority limits per lender policy | H (D-001) |
| Adverse action notice (Reg B) | Timing and content for business credit; verify details | AH, H to send |
| Small business data reporting (1071) | See below | A once rules final |

## Regulation notes
- Reg B 1002.9 business credit notification: timing "within a reasonable time", with notice within 30 days of a completed application deemed reasonable; content differs by whether prior-year gross revenue was $1 million or less [summary only, S-5; counsel and primary text needed].
- CFPB small business lending (section 1071): per a CFPB search summary, a May 1, 2026 final rule sets a single compliance date of January 1, 2028, first data submission due June 1, 2029, and litigation continues [S-14, verify on the Federal Register]. Implication [I]: a feature, not an MVP requirement; capture application fields now so data collection is possible later.
- Appraisal rules for real-estate-secured loans follow the 2010 Interagency Appraisal and Evaluation Guidelines (cited by SOP App. 19) [V in S-2].

## What this means for the MVP [I]
Build one rule pack first (SBA SOP 50 10 8.1) because it is public, specific and versioned; model conventional lending as a second rule pack that a
lender supplies (their policy), using the same engine. Do not invent conventional thresholds.

## Open items
Obtain a real community-bank commercial credit policy (anonymized) from a design partner; read the OCC Rating Credit Risk and current interagency guidance; confirm Reg B primary text; confirm 1071 on the Federal Register.
