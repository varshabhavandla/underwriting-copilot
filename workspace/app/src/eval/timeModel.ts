/**
 * ESTIMATED underwriter touch-time model. This is NOT a measurement. It converts counts measured from the pipeline (documents, fields,
 * exceptions, memo lines) into time using explicit per-action durations that are ASSUMPTIONS. Every duration is a low/mid/high range so
 * the sensitivity is visible, and the system side deliberately includes a verification burden (the underwriter must still check facts
 * against sources). Replace the assumptions with timed human measurements (docs/MEASUREMENT_PLAN.md) before making any claim.
 */
export interface Counts { documents: number; fields: number; exceptions: number; memoLines: number; rules: number }
export interface Range { low: number; mid: number; high: number }

/** seconds per action, ASSUMED */
export const MANUAL_ASSUMPTIONS = {
  openAndClassifyDocument: { low: 30, mid: 60, high: 120 },
  locateAndKeyField: { low: 15, mid: 30, high: 60 },
  computeChecksPerDocument: { low: 60, mid: 120, high: 240 },
  crossDocumentComparison: { low: 120, mid: 300, high: 600 },
  ruleCheck: { low: 30, mid: 60, high: 120 },
  draftMemoLine: { low: 20, mid: 40, high: 90 },
} as const;

export const ASSISTED_ASSUMPTIONS = {
  openPreparedFile: { low: 30, mid: 60, high: 120 },
  reviewException: { low: 30, mid: 90, high: 240 },
  verifyFieldAgainstSource: { low: 10, mid: 20, high: 45 },
  readMemoLine: { low: 5, mid: 10, high: 25 },
  recordDecision: { low: 60, mid: 120, high: 240 },
} as const;

const sum = (xs: Range[]): Range => ({ low: xs.reduce((a, x) => a + x.low, 0), mid: xs.reduce((a, x) => a + x.mid, 0), high: xs.reduce((a, x) => a + x.high, 0) });
const times = (r: Range, n: number): Range => ({ low: r.low * n, mid: r.mid * n, high: r.high * n });

export function manualSeconds(c: Counts): Range {
  const a = MANUAL_ASSUMPTIONS;
  return sum([times(a.openAndClassifyDocument, c.documents), times(a.locateAndKeyField, c.fields), times(a.computeChecksPerDocument, c.documents), a.crossDocumentComparison, times(a.ruleCheck, c.rules), times(a.draftMemoLine, c.memoLines)]);
}

/** `verifyRate` is the share of extracted fields the underwriter checks against the source (0 to 1). Accepted facts are not verified true, so low rates need a policy decision by the lender. */
export function assistedSeconds(c: Counts, verifyRate: number): Range {
  const a = ASSISTED_ASSUMPTIONS;
  return sum([a.openPreparedFile, times(a.reviewException, c.exceptions), times(a.verifyFieldAgainstSource, Math.round(c.fields * verifyRate)), times(a.readMemoLine, c.memoLines), a.recordDecision]);
}

/**
 * Ratio of assisted to manual time under matched assumptions (low with low, mid with mid, high with high) and under the worst mix
 * (assisted high vs manual low), so a reader sees how much the conclusion depends on the assumptions.
 */
export function compare(c: Counts, verifyRate: number, unreadable = false): { manual: Range; assisted: Range; ratioMid: number; ratioWorst: number; ratioBest: number } {
  const manual = manualSeconds(c);
  // unreadable documents (no OCR yet) give the assisted flow no extraction benefit: the underwriter does the manual work plus the console overhead
  const assisted = unreadable ? sum([manual, ASSISTED_ASSUMPTIONS.openPreparedFile, ASSISTED_ASSUMPTIONS.recordDecision]) : assistedSeconds(c, verifyRate);
  return { manual, assisted, ratioMid: assisted.mid / manual.mid, ratioWorst: assisted.high / manual.low, ratioBest: assisted.low / manual.high };
}
