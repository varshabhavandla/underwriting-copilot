# Competitive scan and wedge (B-102)

Date: 2026-10-21. Method: web searches and page fetches (S-16..S-23).
Labels: [V] stated on the cited page or release, [C] company claim we cannot verify, [I] our inference, [A] assumption.
Search limits: results were summaries; vendor trust/security pages were not opened; absence of a feature in our results is NOT proof it does not exist.

## Summary table
| Vendor | What it automates | Public compliance/architecture claims | Relevance to us |
|---|---|---|---|
| nCino (SBA Solution, Credit Analysis Suite, nIQ) | Digitized document collection, SBA forms via DocuSign (1919, 4506-C), SBA workflow rules, E-Tran submission and updates, supports 7(a) and Express and other SBA loans [V, S-16]; automated spreading and AI/ML analytics (nIQ), credit memo generation from platform data [V per search summary, S-17] | SBA page makes no certification claims and gives no metrics [V, S-16] | Incumbent platform; owns the lender workflow where it is the LOS |
| Parlay (partner of nCino, announced 2026-10-08) | AI-native SBA intake, eligibility screening and early deal structuring "before a banker ever opens the file", one-click handoff into nCino [V, S-18] | Release gives no criteria, accuracy, or human-review description [V] | Direct overlap with the "SBA file preparation" wedge at the front end |
| Taktile | Low-code decision engine for credit policy, backtesting and A/B tests, data marketplace (Experian, TransUnion, Equifax, LexisNexis, Codat, others) [V, S-19]. Emphasis in sources is consumer/fintech | No SOC 2 or business-lending statement found [S-19] | Build-vs-integrate reference for our rules engine; not SBA-specific |
| Zest AI | ML underwriting models with multivariate explainability, debiasing, model-risk documentation and fair-lending reports; credit unions and smaller institutions [C, S-20] | Vendor claims; no commercial/SBA product found | Model for how to present explainability and fair-lending evidence |
| Upstart | Marketplace/consumer lending model [only a third-party comparison found, S-20] | Not researched at primary level | Not a competitor in SBA file prep; skip |
| Ocrolus | Document automation and cash-flow analytics for small-business, mortgage and consumer lending; OCR plus human-in-the-loop QC; claims over 99 percent accuracy [C, S-21]; 2021 claims of 20 percent default-prediction lift [C] | SOC 2 status not found; no SBA-program content found in our results | Strongest comparable for extraction; candidate component to buy rather than build |

## Observations
1. The "up to 80 percent" claim in the reference pitch matches a Parlay/nCino release: customers "noted the manual work needed to reach a credit-ready file dropped by up to 80 percent", unnamed and unmeasured [C, S-18]. Treat 80 percent as a hypothesis we measure ourselves (DECISIONS D-005, B-103).
2. Front-end SBA intake and eligibility screening now has a funded partnership with the largest commercial-lending platform [V]. A solo builder should not compete there.
3. SBA changed the game for eligibility: SBA determines eligibility from E-Tran data, so "eligibility screening" is a data-quality pre-check [V, S-12]. What remains lender-owned: credit analysis, documentation, collateral, credit memo, and exposure at guaranty purchase review [V, S-2].
4. Vendor impact claims should be reported by file class, never as one headline figure; we do this in our own measurement plan (MEASUREMENT_PLAN.md) [I].
5. Explainability and fair-lending packaging (Zest) is a sales requirement for any model-driven decisioning. Our design avoids ML credit scoring: AI extracts and drafts; rules and a human decide [I]. That narrows model-risk scope but does not remove the lender's vendor-management review.

## Gaps a solo builder could credibly exploit [I, to validate with lenders]
- **SOP-cited file review after intake**: recompute DSC, freshness windows, guaranty percentage and cap, maturity, refinance, collateral and appraisal tests from the lender's file, and flag each exception with the SOP section and version. Our searches found no vendor describing this at that depth; nCino's SBA page does not mention it [S-16]. This is the lender's real exposure point because SBA reviews the lender's analysis at guaranty purchase and oversight [V, S-2].
- **LOS-agnostic**: works from uploaded documents and exports, so community banks not on nCino can use it [A].
- **Evidence-first drafts**: credit memo drafts where every statement links to a cited source passage [I].
- **Transparent pricing and versioned rule packs** [I].

## Recommended wedge (provisional, replaces D-005)
**SBA 7(a) file review and credit-memo drafting for community-bank PLP lenders: cited extraction, SOP-mapped exception detection, human underwriter decision.** Start with Standard 7(a) and 7(a) Small.
Not the wedge: intake and eligibility screening (contested), generic document extraction (commodity; buy or use a model API), ML credit scoring (regulatory burden).

## Objections (skeptical lender CISO and examiner)
1. Why trust a solo vendor with borrower NPI? Needs a security evidence pack, small-scope pilot on synthetic then redacted data, and honest "no certifications held" language.
2. Does AI-prepared analysis weaken the lender's attestation to SBA? Unresolved; legal item 7. Mitigation: every figure traceable, underwriter owns the memo.
3. What happens when the SOP changes? Rule packs versioned by SOP version, staleness check, B-112.
4. nCino plus Parlay may extend downstream: probable; our moat is depth of SOP conformance and LOS independence, not features nobody can copy [I].

## Not verified / next
Vendor trust centers (nCino, Ocrolus, Taktile); other SBA-specific vendors (a vendor-authored article exists, S-22, but no named comparison found); community-bank LOS landscape; pricing of any competitor. B-114 covers verifying claims.
