import { describe, expect, it } from "vitest";
import { ASSISTED_ASSUMPTIONS, assistedSeconds, compare, manualSeconds } from "../../src/eval/timeModel";
import { renderReport } from "../../src/eval/report";
import { FILE_CLASSES } from "../../src/synthetic/classes";
import type { ClassResult } from "../../src/eval/pipelineEval";

const c = { documents: 6, fields: 34, exceptions: 2, memoLines: 30, rules: 9 };

describe("estimated time model", () => {
  it("is ordered low <= mid <= high for both flows", () => {
    for (const r of [manualSeconds(c), assistedSeconds(c, 0.5)]) { expect(r.low).toBeLessThanOrEqual(r.mid); expect(r.mid).toBeLessThanOrEqual(r.high); }
  });
  it("assisted time grows with exceptions and with the share of fields verified (the burden is not hidden)", () => {
    expect(assistedSeconds({ ...c, exceptions: 6 }, 0.5).mid).toBeGreaterThan(assistedSeconds(c, 0.5).mid);
    expect(assistedSeconds(c, 1).mid).toBeGreaterThan(assistedSeconds(c, 0.25).mid);
    expect(assistedSeconds(c, 0).mid).toBe(ASSISTED_ASSUMPTIONS.openPreparedFile.mid + 2 * ASSISTED_ASSUMPTIONS.reviewException.mid + 30 * ASSISTED_ASSUMPTIONS.readMemoLine.mid + ASSISTED_ASSUMPTIONS.recordDecision.mid);
  });
  it("the ratio range exposes assumption sensitivity: the worst pairing can exceed 1", () => {
    const r = compare(c, 1);
    expect(r.ratioBest).toBeLessThan(r.ratioMid);
    expect(r.ratioMid).toBeLessThan(r.ratioWorst);
    expect(r.ratioWorst).toBeGreaterThan(1);
  });
  it("unreadable documents give no benefit: assisted is at least the manual time", () => {
    const r = compare(c, 0.25, true);
    expect(r.assisted.mid).toBeGreaterThanOrEqual(r.manual.mid);
    expect(r.ratioMid).toBeGreaterThan(1);
  });
});

describe("report wording", () => {
  const rs: ClassResult[] = FILE_CLASSES.map((cls) => ({ cls, packets: 2, truthFields: 10, acceptedCorrect: 10, falseAccepts: 0, proposedOnly: 0, notExtracted: 0, expectedDefects: cls.expects.length * 2, detectedDefects: cls.expects.length * 2, falsePositivePackets: 0, memoVerified: 2, integrityAlertPackets: 0, decisionsMade: 0, counts: c, ingestMs: [5], buildMs: [7] }));
  const md = renderReport(rs, { n: 2, commit: "abc", date: "2026-10-22" });
  it("labels what is measured, estimated and not measured", () => {
    expect(md).toMatch(/\*\*Measured\*\*/); expect(md).toMatch(/\*\*Estimated\*\*/); expect(md).toMatch(/\*\*Not measured\*\*/);
    expect(md).toMatch(/ESTIMATED, not measured/);
    expect(md).toMatch(/Do not quote the ratios as a time saving/);
  });
  it("never states a savings percentage or claims real-lender results", () => {
    expect(md).not.toMatch(/reduces? (decision |processing )?time by/i);
    expect(md).not.toMatch(/\d+\s?% (faster|reduction|savings)/i);
  });
});
