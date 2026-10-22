import { parseAmountToCents } from "../money";
import type { FieldKind } from "./schemas";

/** Canonical comparable form of a value, or null if it is not valid for its kind. */
export function canonical(kind: FieldKind, raw: string): string | null {
  const v = raw.trim();
  if (kind === "money") {
    const neg = /^\(.*\)$/.test(v) || v.startsWith("-");
    const c = parseAmountToCents(v.replace(/^[-(]+|[)]+$/g, ""));
    return c === null ? null : (neg ? -c : c).toString();
  }
  if (kind === "int") return /^\d{1,6}$/.test(v) ? v : null;
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(v);
  if (!m) return null;
  const d = new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])));
  return d.getUTCFullYear() === Number(m[1]) && d.getUTCMonth() === Number(m[2]) - 1 && d.getUTCDate() === Number(m[3]) ? v : null;
}

export const squash = (s: string): string => s.replace(/\s+/g, " ").trim();
