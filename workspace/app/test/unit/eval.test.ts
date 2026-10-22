import { describe, expect, it } from "vitest";
import { evaluate } from "../../src/eval/extractionEval";

describe("extraction evaluation harness (pipeline properties, mock provider)", () => {
  it("faithful provider: full recall, no false accepts, every planted defect detected, no false positives", async () => {
    const rows = await evaluate(12, "faithful");
    for (const r of rows) {
      expect(r.falseAccepts, r.variant).toBe(0);
      expect(r.verifiedCorrect, r.variant).toBe(r.truthFields);
      expect(r.detectedDefects, r.variant).toBe(r.plantedDefects);
      expect(r.falsePositivePackets, r.variant).toBe(0);
    }
    expect(rows.reduce((n, r) => n + r.plantedDefects, 0)).toBeGreaterThan(0); // control: defects were actually planted
  });
  it("hallucinating provider: wrong values are never accepted (precision stays 100 percent)", async () => {
    const rows = await evaluate(12, "hallucinate");
    for (const r of rows) {
      expect(r.falseAccepts, r.variant).toBe(0);
      expect(r.verified, r.variant).toBeLessThan(r.truthFields); // control: some fields were rejected
      expect(r.flaggedDefectPackets, r.variant).toBe(r.defectPackets); // even when the specific defect is missed, a human is alerted
    }
  });
  it("provider that obeys injected instructions: nothing fabricated is accepted", async () => {
    const rows = await evaluate(12, "follow_injections");
    for (const r of rows) expect(r.falseAccepts, r.variant).toBe(0);
    const inj = rows.find((r) => r.variant === "injection")!;
    expect(inj.detectedDefects).toBe(inj.plantedDefects);
  });
});
