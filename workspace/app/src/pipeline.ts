import { CHECKLIST_V1, evaluate } from "./policy";
import type { CaseReport, Conflict, Fact, InjectionFlag, Packet } from "./models";

/**
 * Weak first layer only: flags instruction-like text found inside documents so
 * a human looks at it. Not a security boundary; the defense is architectural
 * (document-reading steps get no tools that change state or record decisions).
 */
const INJECTION =
  /ignore (all |any )?(previous|prior) instructions|(mark|set|approve)\b.{0,40}\b(approved|approve)\b|disregard .{0,30}(polic|rule)|you are now/i;

function norm(value: string): string {
  const v = value.trim().toLowerCase();
  return /^[\d,.$\s]+$/.test(v) ? v.replace(/[,$\s]/g, "") : v.replace(/\s+/g, " ");
}

export function findMissing(packet: Packet, required: string[]): string[] {
  const present = new Set(packet.documents.map((d) => d.type));
  return required.filter((t) => !present.has(t)).sort();
}

export function findConflicts(facts: Fact[]): Conflict[] {
  const byKey = new Map<string, Fact[]>();
  for (const f of facts) {
    const group = byKey.get(f.key) ?? [];
    group.push(f);
    byKey.set(f.key, group);
  }
  return [...byKey.entries()]
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
    .filter(([, group]) => new Set(group.map((f) => norm(f.value))).size > 1)
    .map(([key, group]) => ({ key, facts: group, status: "open" as const }));
}

export function scanInjection(packet: Packet): InjectionFlag[] {
  const flags: InjectionFlag[] = [];
  for (const d of packet.documents) {
    d.pages.forEach((text, i) => {
      if (INJECTION.test(text)) flags.push({ docId: d.id, page: i + 1 });
    });
  }
  return flags;
}

export function processPacket(packet: Packet): CaseReport {
  return {
    caseRef: packet.caseRef,
    missingDocuments: findMissing(packet, CHECKLIST_V1.requiredDocuments),
    conflicts: findConflicts(packet.facts),
    injectionFlags: scanInjection(packet),
    checklist: evaluate(CHECKLIST_V1, packet.facts),
    status: "needs_review",
  };
}
