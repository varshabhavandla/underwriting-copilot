# Time-to-decision measurement plan (B-103)

Goal: test the hypothesis that AI-assisted file preparation substantially reduces time to a decision-ready file. The reference pitch claims "up to 80 percent"; the only matching public claim we found is an unnamed-customer statement in a vendor release (S-18). We treat 80 percent as a hypothesis and report only what we measure.

## What counts as measured, simulated, estimated
| Class | Meaning | May be stated as |
|---|---|---|
| Measured | Produced by running our system on a fixed synthetic test set, with logs | "On N synthetic packets, system step X took T" |
| Simulated | A human performs the manual workflow on the same synthetic packets under a written protocol, with a timer | "In a simulated manual baseline performed by one person on N synthetic packets, step X took T" |
| Estimated | Extrapolated or assumed | "We estimate", with the assumption listed |
We make no claim about any real lender's time savings until a pilot measures it (class: Measured at the lender, with their consent).

## Metrics
1. **Underwriter touch time to decision-ready file** (minutes of human attention). Primary metric.
2. **Elapsed time** from packet received to status needs_review (system) versus to the same state in the manual baseline. Borrower response time is excluded and reported separately.
3. **Extraction accuracy**: field-level precision and recall against ground truth for each document type; fraction of fields that are cited to a passage that actually contains the value.
4. **Exception detection**: per planted exception type, recall and precision. A missed exception (false negative) is weighted as the worst error.
5. **Memo faithfulness**: share of memo statements and numbers that trace to an accepted fact or calculation (target: all; any untraceable statement is a defect).
6. **Reviewer correction rate**: fields changed by the underwriter per packet, and time spent correcting.
7. **Cost per packet**: LLM and OCR spend measured from the gateway logs.

## Test set
Synthetic only (no real borrower data). Generator is backlog item B-310. Stratify by file class and report each class separately; do not publish a single blended number.
File classes: clean; missing document; stale document (over 90/120 days); conflicting facts; refinance; change of ownership; start-up (projections); collateral shortfall; scanned/low quality; document containing injected instructions.
Size: at least 10 packets per class for the first report (about 100). This is a pilot-sized set, so report ranges, not point claims. [A: the size is a judgment; revise after the first variance estimate.]

## Baseline protocol (simulated)
- Same packets, same checklist (the SOP-derived rule pack), done by hand with a written step list: classify, read, key facts into a worksheet, check freshness, compute DSC and collateral, list exceptions, draft the memo.
- One operator, timed per step with a timer; record start/stop; order of packets randomized; operator does not see system output beforehand.
- Disclosure: the operator is the builder, who knows the system. This biases toward a faster baseline (conservative for our claim). A second operator is added when available.

## Comparison protocol (with system)
Underwriter console time from opening the prepared file to a recorded decision on a fixture, including correcting any wrong fields. Measured by instrumented timestamps in the console, not by self-report.

## Analysis
Per class: median and interquartile range of touch time for baseline and system; ratio of medians with a bootstrap interval; accuracy tables. Pre-register thresholds before the run: success if touch time falls and zero missed critical exceptions in the planted set; otherwise report as failure. No post-hoc dropping of packets.

## What would change our mind
If touch time falls but correction time or missed exceptions rise enough to erase the gain, we report that. If accuracy on a class is below the pre-registered threshold, that class is excluded from any claim.

## Reporting language rules
Use the class labels above. Never say "reduces decision time by X percent" for real lenders. Always state N, file class, operator, and that data are synthetic.

## Results so far (loop 7): pipeline checks only, no model quality claim
`npm run eval:extraction` replays 30 seeded synthetic packets per variant (7 variants) with a mock provider that reads printed labels.
- Faithful provider: 100 percent field recall and precision, 0 false accepts, every planted defect (arithmetic, balance, staleness, income mismatch, injected instructions) detected as its own exception kind, 0 false positives on clean packets.
- Provider that invents a value: 81.8 percent recall (the invented field is rejected), 0 false accepts. Some specific defects are missed because the field needed to check them was rejected, but every defective packet still raises an exception (a human would look).
- Provider that obeys injected instructions: 0 false accepts; fabricated and out-of-schema fields never become facts.
These numbers show the verification and validator layers work as designed. They say nothing about how a real model will perform; the same harness must be run against a real provider (B-124) before any accuracy statement.
