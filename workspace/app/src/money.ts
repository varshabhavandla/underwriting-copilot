/** Money is held as integer cents (bigint) so comparisons never hit float error. */
export function parseAmountToCents(value: string): bigint | null {
  const cleaned = value.replace(/[$,\s]/g, "");
  const m = /^(\d+)(?:\.(\d{1,2}))?$/.exec(cleaned);
  if (!m) return null;
  const whole = m[1] ?? "0";
  const frac = (m[2] ?? "").padEnd(2, "0");
  return BigInt(whole) * 100n + BigInt(frac);
}

export function formatCents(cents: bigint): string {
  const whole = cents / 100n;
  const frac = (cents % 100n).toString().padStart(2, "0");
  return `${whole}.${frac}`;
}
