import { createHash } from "node:crypto";
import { canonical, squash } from "../extraction/normalize";
import { DOC_TYPES, specFor, SCHEMAS, type DocType } from "../extraction/schemas";
import { Redactor } from "./redact";
import { BudgetExceeded, ExtractResponse, ProviderFailed, type LlmProvider } from "./types";

export interface GatewayOptions {
  promptVersion: string;
  maxInputChars: number;
  maxCallsPerCase: number;
  maxTokensPerCase: number;
  timeoutMs: number;
}

export const DEFAULT_OPTIONS: GatewayOptions = {
  promptVersion: "extract-facts@1",
  maxInputChars: 60_000,
  maxCallsPerCase: 20,
  maxTokensPerCase: 200_000,
  timeoutMs: 20_000,
};

export interface VerifiedField {
  field: string;
  value: string;
  canonicalValue: string;
  page: number;
  passage: string;
}

export interface Rejected {
  field: string;
  reason: "field_not_allowed" | "invalid_value" | "page_out_of_range" | "passage_not_in_document" | "value_not_in_passage";
}

export interface LlmCallRecord {
  provider: string;
  model: string;
  promptVersion: string;
  inputHash: string;
  outputHash: string;
  tokensEstimate: number;
  modelConfidence?: number | undefined;
  redactedItems: number;
  result: "ok" | "error";
  error?: string;
}

export interface ExtractionOutcome {
  verified: VerifiedField[];
  rejected: Rejected[];
  call: LlmCallRecord;
}

const sha = (s: string) => createHash("sha256").update(s).digest("hex");

/**
 * The only code that talks to a model provider. Enforces: task allowlist, field allowlist, per-case budgets,
 * redaction before egress, timeout, strict output schema, and citation verification against the ORIGINAL document text.
 * No tools are exposed to the provider; its output is a proposal and nothing more.
 */
export class LlmGateway {
  private readonly spent = new Map<string, { calls: number; tokens: number }>();
  constructor(private readonly provider: LlmProvider, private readonly opt: GatewayOptions = DEFAULT_OPTIONS) {}

  async extractFacts(caseId: string, docType: string, pages: string[]): Promise<ExtractionOutcome> {
    if (!(DOC_TYPES as string[]).includes(docType)) throw new Error(`task not allowed for document type ${docType}`);
    const dt = docType as DocType;
    const chars = pages.reduce((n, p) => n + p.length, 0);
    if (chars > this.opt.maxInputChars) throw new BudgetExceeded("document exceeds input size limit");
    const tokens = Math.ceil(chars / 4);
    const used = this.spent.get(caseId) ?? { calls: 0, tokens: 0 };
    if (used.calls + 1 > this.opt.maxCallsPerCase || used.tokens + tokens > this.opt.maxTokensPerCase) {
      throw new BudgetExceeded("per-case model budget exhausted");
    }
    this.spent.set(caseId, { calls: used.calls + 1, tokens: used.tokens + tokens });

    const redactor = new Redactor();
    const redactedPages = pages.map((p) => redactor.redact(p));
    const allowed = SCHEMAS[dt].map((f) => f.field);
    const request = { task: "extract_facts" as const, docType: dt, promptVersion: this.opt.promptVersion, allowedFields: allowed, pages: redactedPages };
    const inputHash = sha(JSON.stringify(request));
    const base = { provider: this.provider.id, model: this.provider.model, promptVersion: this.opt.promptVersion, inputHash, tokensEstimate: tokens, redactedItems: redactor.size };

    const ac = new AbortController();
    const timer = setTimeout(() => ac.abort(), this.opt.timeoutMs);
    let raw: unknown;
    try {
      raw = await Promise.race([
        this.provider.extract(request, ac.signal),
        new Promise<never>((_, rej) => ac.signal.addEventListener("abort", () => rej(new ProviderFailed("provider timeout")))),
      ]);
    } catch (e) {
      return { verified: [], rejected: [], call: { ...base, outputHash: "", result: "error", error: (e as Error).message } };
    } finally {
      clearTimeout(timer);
    }
    const outputHash = sha(JSON.stringify(raw));
    const parsed = ExtractResponse.safeParse(raw);
    if (!parsed.success) {
      return { verified: [], rejected: [], call: { ...base, outputHash, result: "error", error: "output failed schema validation" } };
    }

    const verified: VerifiedField[] = [];
    const rejected: Rejected[] = [];
    const seen = new Set<string>();
    const originalPages = pages.map(squash);
    for (const f of parsed.data.fields) {
      const spec = specFor(dt, f.field);
      if (!spec || seen.has(f.field)) {
        rejected.push({ field: f.field, reason: "field_not_allowed" });
        continue;
      }
      seen.add(f.field);
      const value = redactor.restore(f.value);
      const passage = squash(redactor.restore(f.passage));
      const canon = canonical(spec.kind, value);
      if (canon === null) { rejected.push({ field: f.field, reason: "invalid_value" }); continue; }
      const page = originalPages[f.page - 1];
      if (page === undefined) { rejected.push({ field: f.field, reason: "page_out_of_range" }); continue; }
      if (!page.includes(passage)) { rejected.push({ field: f.field, reason: "passage_not_in_document" }); continue; }
      // the value itself must be visible in the cited passage, compared in canonical form
      const tokens = passage.split(/[\s:]+/).map((t) => canonical(spec.kind, t.replace(/[,$]/g, (c) => (c === "," ? "," : ""))));
      const inPassage = passage.includes(value) || tokens.includes(canon);
      if (!inPassage) { rejected.push({ field: f.field, reason: "value_not_in_passage" }); continue; }
      verified.push({ field: f.field, value, canonicalValue: canon, page: f.page, passage });
    }
    return { verified, rejected, call: { ...base, outputHash, modelConfidence: parsed.data.modelConfidence, result: "ok" } };
  }
}
