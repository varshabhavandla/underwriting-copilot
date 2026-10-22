import { z } from "zod";

export const MemoLine = z.object({ text: z.string().min(1).max(600), cites: z.array(z.string().min(1).max(80)).max(20) }).strict();
export const MemoDraft = z.object({
  sections: z.array(z.object({ title: z.string().min(1).max(120), lines: z.array(MemoLine).max(60) }).strict()).max(12),
}).strict();
export type MemoDraftT = z.infer<typeof MemoDraft>;

/** Everything a memo line may cite: id -> the renderings of its value that may legitimately appear in text. */
export interface MemoSource {
  id: string;
  label: string;
  /** every way the value may be written in a sentence (canonical forms) */
  renderings: string[];
  /** a short, human-readable statement of the source value, shown to the drafter */
  text: string;
}

export interface MemoRequest {
  task: "draft_memo";
  promptVersion: string;
  businessName: string;
  sources: MemoSource[];
}

export const REQUIRED_SECTIONS = ["Business and request", "Financial summary", "Rule results and exceptions", "Open items"] as const;

export interface MemoProblem {
  section: string;
  line: number;
  kind: "uncited_number" | "unknown_citation" | "number_not_in_cited_source" | "decision_language" | "missing_section" | "no_citation";
  detail: string;
}
