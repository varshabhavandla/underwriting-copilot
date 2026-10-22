/**
 * Writes synthetic packets as plain-text files plus a timing worksheet so a person can perform the manual baseline.
 * Usage: tsx scripts/export-packets.ts <outDir> [perClass=10]. Packet order in the worksheet is shuffled with a fixed seed.
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { FILE_CLASSES } from "../src/synthetic/classes";
import { makePacket } from "../src/synthetic/generate";

const out = process.argv[2];
const per = Number(process.argv[3] ?? 10);
if (!out) throw new Error("usage: tsx scripts/export-packets.ts <outDir> [perClass]");
mkdirSync(out, { recursive: true });
const rows: { id: string; cls: string }[] = [];
for (const [ci, cls] of FILE_CLASSES.entries()) {
  if (cls.unreadable) continue; // scanned class needs image files, not text
  for (let i = 0; i < per; i++) {
    const seed = (ci + 1) * 1000 + i + 1;
    const pk = makePacket(seed, cls.variant, new Date("2026-10-21T00:00:00Z"));
    const dir = join(out, `packet-${seed}`);
    mkdirSync(dir, { recursive: true });
    for (const d of pk.docs) writeFileSync(join(dir, `${d.id}-${d.type}.txt`), d.pages.join("\n\f\n"));
    writeFileSync(join(dir, "APPLICATION.txt"), `Applicant: ${pk.legalName} ${seed}\nRequest: $250,000, 120 months, equipment\n${Object.entries(cls.app).map(([k, v]) => `${k}: ${JSON.stringify(v)}`).join("\n")}\n`);
    rows.push({ id: `packet-${seed}`, cls: cls.id });
  }
}
let s = 12345;
const rnd = () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296);
for (let i = rows.length - 1; i > 0; i--) { const j = Math.floor(rnd() * (i + 1)); [rows[i], rows[j]] = [rows[j]!, rows[i]!]; }
writeFileSync(join(out, "TIMING_WORKSHEET.csv"), ["# fill one row per packet and flow; seconds = time from opening the packet to a decision-ready file", "packet_id,class,flow,operator,seconds", ...rows.map((r) => `${r.id},${r.cls},manual,<your-name>,`)].join("\n") + "\n");
writeFileSync(join(out, "PROTOCOL.txt"), "Manual baseline protocol (docs/MEASUREMENT_PLAN.md): do packets in the listed order; do NOT look at system output first; for each packet: classify and read the documents, key the facts into a worksheet, check freshness, compute debt service coverage and collateral, list exceptions, draft the memo. Time with a stopwatch from opening the first document to a finished memo. Record seconds. Disclose that the operator knows the system.\n");
console.log(`wrote ${rows.length} packets and TIMING_WORKSHEET.csv to ${out}`);
