import { REQUIRED_SECTIONS, type MemoDraftT, type MemoProblem, type MemoSource } from "./types";

const NUMBER = /\d{4}-\d{2}-\d{2}|\$?\d[\d,]*(?:\.\d+)?%?/g;
const DECISION = /\b(recommend(?:s|ed|ation)?|approv(?:e|es|ed|al)|declin(?:e|es|ed)|den(?:y|ies|ied|ial)|should be (?:funded|made))\b/i;

const norm = (s: string) => s.replace(/[,$%]/g, "").replace(/\.0+$/, "");

/**
 * A memo draft is accepted only if every statement is traceable. Rules, in order of strictness:
 * 1. every line has at least one citation, and every cited id exists;
 * 2. every number or date in a line must equal a rendering of one of that line's cited sources (so a figure cannot be attached to the wrong citation);
 * 3. no decision language: the credit decision belongs to the underwriter;
 * 4. required sections exist.
 */
export function verifyMemo(draft: MemoDraftT, sources: MemoSource[]): MemoProblem[] {
  const byId = new Map(sources.map((s) => [s.id, s]));
  const problems: MemoProblem[] = [];
  for (const req of REQUIRED_SECTIONS) {
    if (!draft.sections.some((s) => s.title === req)) problems.push({ section: req, line: 0, kind: "missing_section", detail: `required section "${req}" is missing` });
  }
  for (const sec of draft.sections) {
    sec.lines.forEach((line, i) => {
      const at = { section: sec.title, line: i + 1 };
      if (line.cites.length === 0) problems.push({ ...at, kind: "no_citation", detail: "line has no citation" });
      const cited = line.cites.map((c) => ({ id: c, src: byId.get(c) }));
      for (const c of cited) if (!c.src) problems.push({ ...at, kind: "unknown_citation", detail: `cites unknown source ${c.id}` });
      const allowed = new Set(cited.flatMap((c) => c.src?.renderings ?? []).map(norm));
      for (const tok of line.text.match(NUMBER) ?? []) {
        if (line.cites.length === 0) { problems.push({ ...at, kind: "uncited_number", detail: `number ${tok} without a citation` }); continue; }
        if (!allowed.has(norm(tok))) problems.push({ ...at, kind: "number_not_in_cited_source", detail: `${tok} does not match any cited source` });
      }
      if (DECISION.test(line.text)) problems.push({ ...at, kind: "decision_language", detail: "memo may not recommend or state a credit decision" });
    });
  }
  return problems;
}
