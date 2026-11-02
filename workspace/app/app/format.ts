/** Whole dollars from an amount held in integer cents (money is never a float). */
export const usd = (cents: string | null): string => (cents === null ? "n/a" : `$${(BigInt(cents) / 100n).toLocaleString("en-US")}`);

/** A short form for headline figures: $250K, $1.5M. */
export function usdCompact(cents: bigint): string {
  const dollars = Number(cents / 100n);
  if (dollars >= 1_000_000) return `$${+(dollars / 1_000_000).toFixed(1)}M`;
  if (dollars >= 1_000) return `$${+(dollars / 1_000).toFixed(1)}K`;
  return `$${dollars}`;
}

export const STATUS_LABEL: Record<string, string> = {
  needs_review: "Needs review",
  handed_off: "Handed off",
  approved: "Approved",
  declined: "Declined",
};
export const statusLabel = (s: string): string => STATUS_LABEL[s] ?? s.replace(/_/g, " ");
