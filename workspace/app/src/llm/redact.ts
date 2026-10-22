/**
 * Replaces direct identifiers with stable tokens before any text leaves for a model provider, and restores them afterwards.
 * Money, dates and ordinary labels are left alone; extraction needs them.
 */
const PATTERNS: { kind: string; re: RegExp; group?: number }[] = [
  { kind: "SSN", re: /\b\d{3}-\d{2}-\d{4}\b/g },
  { kind: "EIN", re: /\b\d{2}-\d{7}\b/g },
  { kind: "ACCT", re: /\b(?:account|acct|routing)(?:\s+(?:number|no\.?|#))?\s*[:#]?\s*(\d{6,17})\b/gi, group: 1 },
  { kind: "EMAIL", re: /\b[\w.+-]+@[\w-]+(?:\.[\w-]+)+\b/g },
  { kind: "PHONE", re: /\b\(?\d{3}\)?[-. ]\d{3}[-. ]\d{4}\b/g },
];

export class Redactor {
  private readonly vault = new Map<string, string>();
  private readonly counts = new Map<string, number>();
  private readonly byValue = new Map<string, string>();

  private token(kind: string, value: string): string {
    const known = this.byValue.get(`${kind}|${value}`);
    if (known) return known;
    const n = (this.counts.get(kind) ?? 0) + 1;
    this.counts.set(kind, n);
    const t = `[[${kind}_${n}]]`;
    this.vault.set(t, value);
    this.byValue.set(`${kind}|${value}`, t);
    return t;
  }

  redact(text: string): string {
    let out = text;
    for (const p of PATTERNS) {
      out = out.replace(p.re, (...m: unknown[]) => {
        const whole = m[0] as string;
        if (p.group === undefined) return this.token(p.kind, whole);
        const val = m[p.group] as string;
        return whole.replace(val, this.token(p.kind, val));
      });
    }
    return out;
  }

  restore(text: string): string {
    return text.replace(/\[\[[A-Z]+_\d+\]\]/g, (t) => this.vault.get(t) ?? t);
  }

  get size(): number {
    return this.vault.size;
  }
}
