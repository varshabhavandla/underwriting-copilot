/** Minimal in-process counters with Prometheus text output. Serverless instances are short-lived; production should also export to the platform's metrics (B-309). */
const counters = new Map<string, Map<string, number>>();
const esc = (v: string) => v.replace(/\\/g, "\\\\").replace(/"/g, '\\"').replace(/\n/g, "\\n");

export function inc(name: string, labels: Record<string, string> = {}, by = 1): void {
  if (!/^[a-z_][a-z0-9_]*$/.test(name)) throw new Error("invalid metric name");
  const key = Object.entries(labels).sort(([a], [b]) => (a < b ? -1 : 1)).map(([k, v]) => `${k}="${esc(v.slice(0, 80))}"`).join(",");
  const m = counters.get(name) ?? new Map<string, number>();
  if (!m.has(key) && m.size >= 500) return; // label-cardinality cap
  m.set(key, (m.get(key) ?? 0) + by);
  counters.set(name, m);
}

export function render(): string {
  const lines: string[] = [];
  for (const [name, m] of [...counters.entries()].sort()) {
    lines.push(`# TYPE ${name} counter`);
    for (const [labels, v] of m) lines.push(`${name}${labels ? `{${labels}}` : ""} ${v}`);
  }
  return lines.join("\n") + "\n";
}

export const reset = (): void => counters.clear();
