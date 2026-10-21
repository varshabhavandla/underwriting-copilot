# Fair lending and model risk (B-203)

Labels: [V] verified in a cited primary source, [S] secondary source only, [I] inferred, [A] assumed. Not legal advice; open questions go to docs/LEGAL_REVIEW.md.

## 1. The model-risk guidance changed in April 2026
The brief asked for alignment with SR 11-7. SR 11-7 no longer exists in force: the Federal Reserve's SR 26-2 (April 17, 2026) "supersedes and replaces SR letter 11-7" and SR 21-8 [V, S-27]. The attached guidance is issued jointly by the Fed, FDIC and OCC [V, S-28]. Points that matter to us, all from the guidance text [V, S-28]:
- It "does not set forth enforceable standards or prescriptive requirements"; non-compliance "will not result in supervisory criticism", though unsafe or unsound model management can still draw supervisory action.
- It is "expected to be most relevant to banking organizations with over $30 billion in total assets"; models at banks with $30 billion or less are "generally" excluded, unless the bank has significant model exposure. Community banks (our target) are mostly below that line [I].
- A "model" is a complex quantitative method that applies statistical, economic or financial theories to produce quantitative estimates. The definition excludes "simple arithmetic calculations" and "deterministic rule-based processes and software" without such theories [V].
- Footnote 3: "Generative AI and agentic AI models ... are not within the scope of this guidance", but a bank's "risk management and governance practices should guide the determination of appropriate governance and controls for any tools, processes, or systems not covered" [V].
- Principles in scope for models: inventory, documentation, independent validation (including of vendor products: conceptual soundness, design, development data, performance), ongoing monitoring, governance (sections V to VII) [V].
Implication [I]: our deterministic rule engine and calculators are not "models" under this definition; our LLM extraction and drafting are generative AI, outside the guidance but inside each lender's own governance. A lender will still ask for model-risk-style evidence, so we provide it (section 4). Whether a given lender treats our tool as a model is that lender's decision (LEGAL_REVIEW 16).

## 2. Fair lending (ECOA / Regulation B)
What we verified: Reg B 1002.9 business-credit notification timing and content differ by size of business (summary, S-5). What we could not verify: whether CFPB Circulars 2022-03 and 2023-03 (adverse action reasons when AI or complex models are used) remain in force. The CFPB circulars page did not list them and referenced a May 12, 2025 withdrawal of many guidance documents without naming them [V that the page is silent, S-29]. Do not cite the circulars as current. Counsel item.
The underlying duty still applies [S]: creditors must give accurate, specific reasons for adverse action. In our design the decision, and therefore the reasons, belong to the underwriter; the tool must make accurate reasons easy to state and impossible to misstate.

## 3. Where unfair outcomes could still arise in a rules-plus-human design [I]
| Risk | Example | Control |
|---|---|---|
| Extraction errors correlated with applicant traits | Lower accuracy on scans, non-English or atypical statements | Report extraction accuracy by document quality and type; human confirmation for low-quality inputs; no silent auto-accept |
| Inconsistent treatment through exceptions | Some files get more scrutiny because of how the system flags them | Exception rules are explicit, versioned and applied uniformly; log every exception with its rule |
| Drafted language | Memo wording that implies subjective traits | Memo may only state accepted facts and computed values; no free-form characterization; underwriter adopts text |
| Thresholds beyond the SOP | Lender policy overlays | Rule packs keep SOP rules (federal) separate from lender-supplied overlays; overlays reviewed by the lender's compliance |
| Prohibited-basis information | Model sees name, address or documents revealing protected characteristics | No protected-basis inference or scoring; do not extract or surface attributes that are not needed for a rule; counsel to confirm what may be collected |
| Timing differences | Slower processing for some files | Track turnaround by class; alert on divergence |
Disparate-impact testing on lender outcomes is the lender's responsibility; we supply exportable decision data (counsel to confirm scope, LEGAL_REVIEW 17).

## 4. Evidence pack we maintain (aligned to the principles in SR 26-2 section V-VII [V])
- **Inventory:** list of every automated component: rule packs, extraction prompts, memo-drafting prompts, model ids, providers, with owner and purpose.
- **Versioning:** rule packs by SOP version and effective date; prompts as versioned files; models pinned; decision records store the versions used (docs/AGENTIC_LAYER.md).
- **Evaluation harness:** synthetic test set by file class, extraction accuracy, exception recall and precision, memo faithfulness, adversarial set; results in an evaluation report with dates and versions (B-308). Re-run on every change to rules, prompts or gateway.
- **Decision logs:** append-only ledger of facts, rules fired, exceptions, memo drafts and underwriter decisions with reasons and overrides.
- **Explainability:** each outcome traces to a rule id, its SOP citation and the source facts with page and passage; no opaque score.
- **Change control:** builder review recorded for rules, prompts, tenancy and security code (a known limitation for a solo vendor).
- **Ongoing monitoring:** production metrics for correction rate, exception rate, failures, latency and cost, reviewed on a schedule.
- **Vendor-product documentation** a lender can validate: purpose, design, data sources, limitations, test results (SR 26-2 section VII [V]).

## 5. Adverse action support
The tool records the underwriter's decision and reasons and can produce a draft notice shell that the lender's compliance reviews. It never sends notices. Notice content requirements are the lender's and must be confirmed with counsel (S-5 gives only a summary).

## 6. Open items
Confirm SR 26-2 text on the effective date and any OCC bulletin number (the OCC page returned an error; secondary sources said Bulletin 2026-13, [S]); confirm circular status; confirm Reg B text; counsel on prohibited-basis data handling.
