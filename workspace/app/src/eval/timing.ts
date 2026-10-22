/** Analysis of REAL timed measurements (manual baseline and assisted flow) per file class. No numbers are assumed here. */
export interface TimingRow { packetId: string; classId: string; flow: "manual" | "assisted"; operator: string; seconds: number }

export function parseCsv(text: string): TimingRow[] {
  const lines = text.split(/\r?\n/).map((l) => l.trim()).filter((l) => l && !l.startsWith("#"));
  const header = lines.shift()?.split(",").map((h) => h.trim());
  if (!header || header.join() !== "packet_id,class,flow,operator,seconds") throw new Error("header must be packet_id,class,flow,operator,seconds");
  return lines.map((l, i) => {
    const [packetId, classId, flow, operator, sec] = l.split(",").map((x) => x.trim());
    const seconds = Number(sec);
    if (!packetId || !classId || !operator) throw new Error(`row ${i + 2}: missing field`);
    if (flow !== "manual" && flow !== "assisted") throw new Error(`row ${i + 2}: flow must be manual or assisted`);
    if (!Number.isFinite(seconds) || seconds <= 0) throw new Error(`row ${i + 2}: seconds must be a positive number`);
    return { packetId, classId, flow, operator, seconds };
  });
}

function rng(seed: number): () => number {
  let a = seed >>> 0;
  return () => { a = (a + 0x6d2b79f5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}
const median = (xs: number[]) => { const s = [...xs].sort((a, b) => a - b); const m = s.length >> 1; return s.length % 2 ? s[m]! : (s[m - 1]! + s[m]!) / 2; };
const quant = (xs: number[], q: number) => { const s = [...xs].sort((a, b) => a - b); return s[Math.min(s.length - 1, Math.max(0, Math.floor(q * s.length)))]!; };

export interface ClassTiming {
  classId: string;
  manualN: number;
  assistedN: number;
  manualMedian: number;
  assistedMedian: number;
  /** assisted / manual, ratio of medians */
  ratio: number;
  ci95: [number, number];
  sufficient: boolean;
}

export const MIN_PER_FLOW = 5;

/** Ratio of medians with a percentile bootstrap interval (each flow resampled separately). Classes with fewer than 5 per flow are marked insufficient. */
export function analyze(rows: TimingRow[], opt: { bootstrap?: number; seed?: number } = {}): ClassTiming[] {
  const B = opt.bootstrap ?? 2000, rand = rng(opt.seed ?? 1);
  const out: ClassTiming[] = [];
  for (const classId of [...new Set(rows.map((r) => r.classId))].sort()) {
    const m = rows.filter((r) => r.classId === classId && r.flow === "manual").map((r) => r.seconds);
    const a = rows.filter((r) => r.classId === classId && r.flow === "assisted").map((r) => r.seconds);
    if (m.length === 0 || a.length === 0) { out.push({ classId, manualN: m.length, assistedN: a.length, manualMedian: m.length ? median(m) : NaN, assistedMedian: a.length ? median(a) : NaN, ratio: NaN, ci95: [NaN, NaN], sufficient: false }); continue; }
    const draw = (xs: number[]) => xs.map(() => xs[Math.floor(rand() * xs.length)]!);
    const ratios: number[] = [];
    for (let i = 0; i < B; i++) ratios.push(median(draw(a)) / median(draw(m)));
    out.push({ classId, manualN: m.length, assistedN: a.length, manualMedian: median(m), assistedMedian: median(a), ratio: median(a) / median(m), ci95: [quant(ratios, 0.025), quant(ratios, 0.975)], sufficient: m.length >= MIN_PER_FLOW && a.length >= MIN_PER_FLOW });
  }
  return out;
}

export function renderTimingTable(rs: ClassTiming[]): string {
  const f = (x: number) => (Number.isFinite(x) ? x.toFixed(2) : "n/a");
  const lines = ["| Class | Manual n | Assisted n | Manual median (s) | Assisted median (s) | Ratio | 95% interval | Status |", "|---|---|---|---|---|---|---|---|"];
  for (const r of rs) lines.push(`| ${r.classId} | ${r.manualN} | ${r.assistedN} | ${f(r.manualMedian)} | ${f(r.assistedMedian)} | ${f(r.ratio)} | ${f(r.ci95[0])} to ${f(r.ci95[1])} | ${r.sufficient ? "ok" : `insufficient data (need ${MIN_PER_FLOW} per flow)`} |`);
  return lines.join("\n");
}
