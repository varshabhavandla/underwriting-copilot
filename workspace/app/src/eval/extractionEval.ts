import { canonical } from "../extraction/normalize";
import { specFor, type DocType } from "../extraction/schemas";
import { validate, type FactView } from "../extraction/validators";
import { DEFAULT_OPTIONS, LlmGateway } from "../llm/gateway";
import { MockProvider, type MockBehavior } from "../llm/mockProvider";
import { scanInjection } from "../pipeline";
import { makePacket, type Variant } from "../synthetic/generate";

export const VARIANTS: Variant[] = ["clean", "bank_arith_error", "balance_imbalance", "stale_statement", "income_mismatch", "injection", "pii_heavy"];
const ASOF = new Date("2026-10-21T00:00:00Z");

export interface EvalRow {
  behavior: MockBehavior;
  variant: Variant;
  packets: number;
  truthFields: number;
  verified: number;
  verifiedCorrect: number;
  /** verified values that differ from ground truth: must be zero */
  falseAccepts: number;
  plantedDefects: number;
  /** planted defects detected as their own specific exception kind */
  detectedDefects: number;
  /** packets with planted defects that raised at least one exception of any kind (so a human would look) */
  flaggedDefectPackets: number;
  defectPackets: number;
  /** exceptions raised on a packet with no planted defect */
  falsePositivePackets: number;
}

/**
 * Replays synthetic packets through the gateway and validators (no database) and scores against ground truth.
 * With the mock provider this measures the PIPELINE (verification, validators, tripwire), not model quality; the same harness
 * scores a real provider unchanged. Truth values are canonical cents/ints/dates.
 */
export async function evaluate(seeds: number, behavior: MockBehavior = "faithful"): Promise<EvalRow[]> {
  const rows: EvalRow[] = [];
  for (const variant of VARIANTS) {
    const r: EvalRow = { behavior, variant, packets: seeds, truthFields: 0, verified: 0, verifiedCorrect: 0, falseAccepts: 0, plantedDefects: 0, detectedDefects: 0, flaggedDefectPackets: 0, defectPackets: 0, falsePositivePackets: 0 };
    for (let seed = 1; seed <= seeds; seed++) {
      const pk = makePacket(seed, variant, ASOF);
      const gw = new LlmGateway(new MockProvider(behavior), DEFAULT_OPTIONS);
      const views: FactView[] = [];
      const kinds = new Set<string>();
      for (const d of pk.docs) {
        const flagged = scanInjection({ caseRef: "", facts: [], documents: [{ id: d.id, type: d.type, version: 1, pages: d.pages }] });
        if (flagged.length) kinds.add("injection_suspected");
        const out = await gw.extractFacts(`${variant}-${seed}`, d.type, d.pages);
        if (out.rejected.length) kinds.add("unverifiable_extraction");
        for (const f of out.verified) {
          r.verified++;
          const t = pk.truth.find((x) => x.docId === d.id && x.field === f.field);
          const spec = specFor(d.type as DocType, f.field)!;
          const truthCanon = t ? canonical(spec.kind, t.value.match(/^\d{4}$/) && spec.kind === "int" ? t.value : spec.kind === "money" ? `${BigInt(t.value) / 100n}.${(BigInt(t.value) % 100n).toString().padStart(2, "0")}` : t.value) : null;
          if (truthCanon !== null && truthCanon === f.canonicalValue) r.verifiedCorrect++;
          else r.falseAccepts++;
          views.push({ docId: d.id, docType: d.type as DocType, field: f.field, canonicalValue: f.canonicalValue });
        }
      }
      for (const i of validate(views, ASOF)) kinds.add(i.kind);
      r.truthFields += pk.truth.length;
      r.plantedDefects += pk.planted.length;
      r.detectedDefects += pk.planted.filter((p) => kinds.has(p)).length;
      if (pk.planted.length === 0 && [...kinds].some((k) => k !== "unverifiable_extraction")) r.falsePositivePackets++;
      if (pk.planted.length > 0) { r.defectPackets++; if (kinds.size > 0) r.flaggedDefectPackets++; }
    }
    rows.push(r);
  }
  return rows;
}

export function summarize(rows: EvalRow[]): string {
  const pct = (a: number, b: number) => (b === 0 ? "n/a" : `${((100 * a) / b).toFixed(1)}%`);
  const head = "behavior           variant            recall   precision  falseAccept  defects  flagged  falsePos";
  const lines = rows.map((r) => [
    r.behavior.padEnd(18), r.variant.padEnd(18), pct(r.verifiedCorrect, r.truthFields).padStart(7), pct(r.verifiedCorrect, r.verified).padStart(10),
    String(r.falseAccepts).padStart(11), `${r.detectedDefects}/${r.plantedDefects}`.padStart(8), `${r.flaggedDefectPackets}/${r.defectPackets}`.padStart(8), `${r.falsePositivePackets}/${r.packets}`.padStart(9),
  ].join(" "));
  return [head, ...lines].join("\n");
}
