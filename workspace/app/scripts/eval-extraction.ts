import { evaluate, summarize } from "../src/eval/extractionEval";

const seeds = Number(process.argv[2] ?? 30);
for (const behavior of ["faithful", "hallucinate", "follow_injections"] as const) {
  console.log(summarize(await evaluate(seeds, behavior)));
  console.log();
}
console.log("defects = planted defect found as its own exception kind; flagged = packet raised any exception (a human would look). In hallucinate mode some specific defects are missed because the field needed to check them was rejected, but the packet is still flagged.");
console.log("Note: the mock provider reads printed labels, so this scores the pipeline (verification, validators, tripwire), not model quality.");
