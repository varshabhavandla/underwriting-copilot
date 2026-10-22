/** Usage: tsx scripts/timing-analysis.ts timings.csv   (columns: packet_id,class,flow,operator,seconds). Prints a Markdown table. */
import { readFileSync } from "node:fs";
import { analyze, parseCsv, renderTimingTable } from "../src/eval/timing";

const file = process.argv[2];
if (!file) throw new Error("usage: tsx scripts/timing-analysis.ts timings.csv");
const rows = parseCsv(readFileSync(file, "utf8"));
console.log(`${rows.length} timed rows, operators: ${[...new Set(rows.map((r) => r.operator))].join(", ")}`);
console.log(renderTimingTable(analyze(rows)));
console.log("\nReport only classes marked ok, state the operators and that data are synthetic, and never extend a class result to real lenders.");
