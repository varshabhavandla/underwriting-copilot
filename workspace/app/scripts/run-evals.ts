import { readdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { processPacket } from "../src/pipeline.js";
import type { Packet } from "../src/models.js";

const dir = join(dirname(fileURLToPath(import.meta.url)), "..", "fixtures", "synthetic");

interface Expected {
  missing_documents: string[];
  conflict_keys: string[];
  injection_flags: number;
  checklist_passed: boolean;
}

interface RawFact {
  key: string;
  value: string;
  citation: { doc_id: string; doc_version: number; page: number; passage: string };
}

interface Fixture {
  packet: {
    case_ref: string;
    documents: { id: string; type: string; version: number; pages: string[] }[];
    facts: RawFact[];
  };
  expected: Expected;
}

function toPacket(p: Fixture["packet"]): Packet {
  return {
    caseRef: p.case_ref,
    documents: p.documents,
    facts: p.facts.map((f) => ({
      key: f.key,
      value: f.value,
      citation: {
        docId: f.citation.doc_id,
        docVersion: f.citation.doc_version,
        page: f.citation.page,
        passage: f.citation.passage,
      },
    })),
  };
}

let failures = 0;
for (const name of readdirSync(dir).filter((f) => f.endsWith(".json")).sort()) {
  const fx = JSON.parse(readFileSync(join(dir, name), "utf8")) as Fixture;
  const r = processPacket(toPacket(fx.packet));
  const actual: Expected = {
    missing_documents: r.missingDocuments,
    conflict_keys: r.conflicts.map((c) => c.key),
    injection_flags: r.injectionFlags.length,
    checklist_passed: r.checklist.passed,
  };
  if (JSON.stringify(actual) !== JSON.stringify(fx.expected)) {
    failures++;
    console.log(`FAIL ${name}\n  expected ${JSON.stringify(fx.expected)}\n  actual   ${JSON.stringify(actual)}`);
  } else {
    console.log(`ok   ${name}`);
  }
}
process.exit(failures ? 1 : 0);
