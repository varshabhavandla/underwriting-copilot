import { describe, expect, it } from "vitest";
import { analyze, parseCsv, renderTimingTable, type TimingRow } from "../../src/eval/timing";

// FAKE numbers for testing the arithmetic only. They are not measurements of anything.
const rows = (cls: string, flow: "manual" | "assisted", xs: number[]): TimingRow[] => xs.map((s, i) => ({ packetId: `${cls}-${i}`, classId: cls, flow, operator: "tester", seconds: s }));

describe("timing analysis (arithmetic checks on fake data)", () => {
  it("constant timings give an exact ratio and a collapsed interval", () => {
    const r = analyze([...rows("c", "manual", [600, 600, 600, 600, 600]), ...rows("c", "assisted", [300, 300, 300, 300, 300])])[0]!;
    expect(r).toMatchObject({ manualMedian: 600, assistedMedian: 300, ratio: 0.5, sufficient: true });
    expect(r.ci95).toEqual([0.5, 0.5]);
  });
  it("the interval widens with noisy data and contains the point estimate", () => {
    const r = analyze([...rows("c", "manual", [400, 500, 600, 700, 800, 900]), ...rows("c", "assisted", [200, 250, 300, 350, 600, 700])])[0]!;
    expect(r.ci95[0]).toBeLessThan(r.ratio);
    expect(r.ci95[1]).toBeGreaterThan(r.ratio);
  });
  it("is deterministic for a seed and different for another", () => {
    const d = [...rows("c", "manual", [400, 500, 650, 700, 800, 950]), ...rows("c", "assisted", [200, 250, 310, 350, 620, 710])];
    expect(analyze(d, { seed: 3 })).toEqual(analyze(d, { seed: 3 }));
    expect(analyze(d, { seed: 3 })[0]!.ci95).not.toEqual(analyze(d, { seed: 4 })[0]!.ci95);
  });
  it("marks classes with fewer than 5 per flow, or one flow missing, as insufficient and never reports a ratio for a missing flow", () => {
    const r = analyze([...rows("few", "manual", [1, 2, 3]), ...rows("few", "assisted", [1, 2, 3]), ...rows("one", "manual", [1, 2, 3, 4, 5])]);
    expect(r.find((x) => x.classId === "few")!.sufficient).toBe(false);
    const one = r.find((x) => x.classId === "one")!;
    expect(one.sufficient).toBe(false);
    expect(Number.isNaN(one.ratio)).toBe(true);
    expect(renderTimingTable(r)).toMatch(/insufficient data/);
  });
  it("parses CSV and rejects bad input", () => {
    const ok = "# comment\npacket_id,class,flow,operator,seconds\np1,clean,manual,amy,610\np1,clean,assisted,amy,240\n";
    expect(parseCsv(ok)).toHaveLength(2);
    expect(() => parseCsv("a,b\n1,2")).toThrow(/header/);
    expect(() => parseCsv("packet_id,class,flow,operator,seconds\np1,clean,robot,amy,5")).toThrow(/flow/);
    expect(() => parseCsv("packet_id,class,flow,operator,seconds\np1,clean,manual,amy,-3")).toThrow(/positive/);
    expect(() => parseCsv("packet_id,class,flow,operator,seconds\np1,clean,manual,amy,")).toThrow(/positive/);
    expect(() => parseCsv("packet_id,class,flow,operator,seconds\np1,clean,manual,,5")).toThrow(/missing/);
  });
});
