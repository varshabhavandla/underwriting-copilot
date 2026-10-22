/** Writes three synthetic packets (clean, bank arithmetic error, injected instructions) as JSON for the walkthrough. Usage: tsx scripts/walkthrough-packets.ts <out.json> */
import { writeFileSync } from "node:fs";
import { makePacket, type Variant } from "../src/synthetic/generate";

const out = process.argv[2];
if (!out) throw new Error("usage: tsx scripts/walkthrough-packets.ts <out.json>");
const plan: { key: string; variant: Variant; seed: number }[] = [
  { key: "clean", variant: "clean", seed: 7101 },
  { key: "arith", variant: "bank_arith_error", seed: 7102 },
  { key: "injection", variant: "injection", seed: 7103 },
];
const asOf = new Date();
const packets = plan.map((p) => {
  const pk = makePacket(p.seed, p.variant, asOf);
  return { key: p.key, variant: p.variant, legalName: pk.legalName, planted: pk.planted, docs: pk.docs.map((d) => ({ type: d.type, name: `${d.type}.txt`, text: d.pages.join("\n\f\n") })) };
});
writeFileSync(out, JSON.stringify(packets, null, 1));
console.log(`wrote ${packets.length} packets`);
