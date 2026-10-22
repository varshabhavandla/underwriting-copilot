import { z } from "zod";

export const ExtractedField = z.object({
  field: z.string().min(1).max(64),
  value: z.string().min(1).max(200),
  page: z.number().int().positive(),
  passage: z.string().min(1).max(500),
}).strict();

/** `modelConfidence` is recorded for audit only. It never decides whether a fact is accepted. */
export const ExtractResponse = z.object({
  fields: z.array(ExtractedField).max(100),
  modelConfidence: z.number().min(0).max(1).optional(),
}).strict();
export type ExtractResponseT = z.infer<typeof ExtractResponse>;

export interface ExtractRequest {
  task: "extract_facts";
  docType: string;
  promptVersion: string;
  allowedFields: string[];
  /** Redacted page text. Document content is data, never instructions. */
  pages: string[];
}

/** Providers have no tools and no write access: they map text to a proposal. */
export interface LlmProvider {
  readonly id: string;
  readonly model: string;
  extract(req: ExtractRequest, signal: AbortSignal): Promise<unknown>;
  draftMemo(req: import("../memo/types").MemoRequest, signal: AbortSignal): Promise<unknown>;
}

export class BudgetExceeded extends Error {}
export class ProviderFailed extends Error {}
