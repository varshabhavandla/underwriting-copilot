import { SCHEMAS, type DocType } from "../extraction/schemas";
import type { MemoRequest } from "../memo/types";
import type { ExtractRequest, LlmProvider } from "./types";

export type MockBehavior = "faithful" | "hallucinate" | "follow_injections" | "garbage" | "slow" | "memo_fabricate" | "memo_decide" | "memo_miscite";

/**
 * Deterministic stand-in for a model provider, used for tests and the local demo. "faithful" reads "Label: value" lines.
 * The other behaviors model failures we must survive: invented values, obeying instructions hidden in a document,
 * malformed output, and a hung call. It records every request it received so tests can inspect what left the system.
 */
export class MockProvider implements LlmProvider {
  readonly id = "mock";
  readonly model = "mock-regex-1";
  readonly seen: ExtractRequest[] = [];
  constructor(private readonly behavior: MockBehavior = "faithful") {}

  async extract(req: ExtractRequest, signal: AbortSignal): Promise<unknown> {
    this.seen.push(req);
    if (this.behavior === "slow") await new Promise((_, rej) => signal.addEventListener("abort", () => rej(new Error("aborted"))));
    if (this.behavior === "garbage") return { fields: "not-an-array" };
    const specs = SCHEMAS[req.docType as DocType] ?? [];
    const fields: { field: string; value: string; page: number; passage: string }[] = [];
    req.pages.forEach((text, i) => {
      for (const line of text.split("\n")) {
        for (const s of specs) {
          const m = new RegExp(`^\\s*${s.label}\\s*:\\s*(.+?)\\s*$`, "i").exec(line);
          if (m) fields.push({ field: s.field, value: m[1]!.replace(/^\$/, ""), page: i + 1, passage: line.trim() });
        }
      }
      if (this.behavior === "follow_injections") {
        const inj = /(?:set|change)\s+(\w+)\s+to\s+\$?([\d,.]+)/i.exec(text);
        if (inj) fields.push({ field: inj[1]!, value: inj[2]!, page: i + 1, passage: inj[0] });
        if (/ignore (all )?previous instructions/i.test(text)) fields.push({ field: "approve_loan", value: "yes", page: i + 1, passage: "ignore previous instructions" });
      }
    });
    if (this.behavior === "hallucinate") {
      const i = fields.findIndex((f) => specs.find((s) => s.field === f.field)?.kind === "money");
      if (i >= 0) fields[i] = { ...fields[i]!, value: "999999999" }; // value that is not in the cited passage
    }
    return { fields, modelConfidence: 0.99 };
  }

  /** Builds each line from a single source's own text, so citations and numbers always agree, then injects failures on request. */
  async draftMemo(req: MemoRequest, signal: AbortSignal): Promise<unknown> {
    if (this.behavior === "slow") await new Promise((_, rej) => signal.addEventListener("abort", () => rej(new Error("aborted"))));
    if (this.behavior === "garbage") return { sections: "nope" };
    const by = (prefix: string) => req.sources.filter((s) => s.id.startsWith(prefix));
    const line = (s: { id: string; text: string }) => ({ text: s.text, cites: [s.id] });
    const sections = [
      { title: "Business and request", lines: [{ text: `Prepared for underwriter review: ${req.businessName}.`, cites: by("A:name").map((s) => s.id) }, ...by("A:").filter((s) => s.id !== "A:name").map(line)] },
      { title: "Financial summary", lines: [...by("F:").map(line), ...by("C:").map(line)] },
      { title: "Rule results and exceptions", lines: [...by("R:"), ...by("X:")].map(line) },
      { title: "Open items", lines: by("N:").map(line) },
    ];
    const first = req.sources.find((s) => s.id.startsWith("F:")) ?? req.sources[0]!;
    if (this.behavior === "memo_fabricate") sections[1]!.lines.push({ text: "Projected revenue will reach $5,000,000.00 next year.", cites: [first.id] });
    if (this.behavior === "memo_decide") sections[3]!.lines.push({ text: "We recommend approval of this request.", cites: [first.id] });
    if (this.behavior === "memo_miscite") sections[1]!.lines[0] = { text: sections[1]!.lines[0]!.text, cites: ["F:does-not-exist"] };
    return { sections };
  }
}
