import { Redactor } from "../llm/redact";

/**
 * Structured JSON logs. Nothing sensitive may reach a log line: field names that usually hold secrets or identifiers are masked, string
 * values are passed through the identifier redactor (SSN, EIN, account numbers, emails, phones), and long strings are truncated.
 * Request bodies are never logged. Log business events by id, not by content.
 */
const SENSITIVE_KEY = /ein|ssn|password|passwd|secret|token|authorization|cookie|account|routing|email|phone|dob|birth|legal_?name|owner|passage|value|body|pages|text/i;
const MAX = 300;

export type Level = "debug" | "info" | "warn" | "error";
const ORDER: Record<Level, number> = { debug: 10, info: 20, warn: 30, error: 40 };

export function scrub(v: unknown, depth = 0): unknown {
  if (v === null || v === undefined) return v;
  if (typeof v === "string") { const s = new Redactor().redact(v); return s.length > MAX ? s.slice(0, MAX) + "…" : s; }
  if (typeof v === "number" || typeof v === "boolean") return v;
  if (typeof v === "bigint") return v.toString();
  if (v instanceof Error) return { name: v.name, message: scrub(v.message) };
  if (depth > 4) return "[depth]";
  if (Array.isArray(v)) return v.slice(0, 20).map((x) => scrub(x, depth + 1));
  if (typeof v === "object") {
    const out: Record<string, unknown> = {};
    for (const [k, val] of Object.entries(v as Record<string, unknown>)) out[k] = SENSITIVE_KEY.test(k) ? "[redacted]" : scrub(val, depth + 1);
    return out;
  }
  return String(typeof v);
}

export type Sink = (line: string) => void;
let sink: Sink = (l) => console.log(l);
let minLevel: Level = (process.env["LOG_LEVEL"] as Level | undefined) ?? "info";
export const setSink = (s: Sink): void => { sink = s; };
export const setLevel = (l: Level): void => { minLevel = l; };

export function log(level: Level, msg: string, fields: Record<string, unknown> = {}): void {
  if (ORDER[level] < ORDER[minLevel]) return;
  sink(JSON.stringify({ ts: new Date().toISOString(), level, msg: scrub(msg), ...(scrub(fields) as Record<string, unknown>) }));
}
