# ASSUMPTIONS
Confidence: high | medium | low. Label: assumed unless a source is cited in SOURCES.md.

| ID | Assumption | Conf. | Invalidated if |
|---|---|---|---|
| A-1 | Small community lenders spend most file time on document collection, completeness and consistency checks, not credit judgment. | low | Interviews/design partner show time dominated elsewhere. |
| A-2 | A lender will accept AI-prepared files if every fact is cited and the human decides. | low | Lender policy/examiner stance forbids AI in file prep. |
| A-3 | Synthetic documents can approximate real extraction difficulty enough to rank approaches (not to claim production accuracy). | medium | Real-document pilot shows large gap. |
| A-4 | Solo cloud cost stays low (under about $100/month) while only dev resources exist. | low | Not yet priced; must be verified from vendor price pages before provisioning. |
| A-5 | The "up to 80%" time-to-decision claim is a pitch figure; unverified. | high (that it is unverified) | A cited study appears. |
| A-6 | SOP text parsed from .docx is accurate enough to draft rules; tables may be lost. | medium | Spot-check against published SOP finds mismatches. |
| A-7 | Reg B business-credit summary (S-5) is correct. | low | eCFR text differs from the fetch summary. |
| A-8 | Vercel Functions can host the FastAPI API for the MVP, with long extraction jobs handled by a separate async mechanism. | low | Function duration/size limits or queue options do not fit document processing (unverified). |
| A-9 | Vercel's reported SOC 2 Type 2 helps, but a lender will still require its own subprocessor review of every vendor, including Vercel. | medium | A target lender accepts hosted-platform attestations alone. |
| A-10 | Community-bank PLP lenders feel enough pain around SOP conformance and credit memo prep to pay for file review. | low | Lender interviews show the pain is elsewhere or already covered by their LOS. |
| A-11 | nCino/Parlay will not quickly deliver deep SOP-cited file review. | low | An nCino or Parlay release covers it. |
| A-12 | Mid-size and small lenders not on nCino exist in large enough numbers to reach LOS-agnostically. | low | Lender-landscape research shows the segment is small or locked into integrated suites. |
| A-13 | Vercel Workflows can run our document pipeline within beta limits and acceptable cost. | low | Limits, pricing or maturity block it; fall back to a queue plus worker. |
| A-14 | Per-tenant keys can be held in a managed key service reachable from Vercel without a long-lived cloud credential. | low | No supported short-lived federation; use a different storage/key vendor. |
| A-15 | Redaction plus schema-checked, tool-less calls keep extraction accurate enough on synthetic data. | low | Evaluation shows accuracy collapse when identifiers are tokenized. |
| A-16 | Most target community banks fall under the $30B line where SR 26-2 is not expected to apply, and will govern our tools by their own vendor and AI policies. | medium | A target lender is above $30B or its examiner treats our tools as models. |
| A-17 | A lender will accept Stage 1 evidence plus an external penetration test for a small pilot before a SOC 2 report exists. | low | Lenders require a SOC 2 report before any pilot. |
