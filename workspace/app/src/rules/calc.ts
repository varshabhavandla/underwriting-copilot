/** Deterministic calculators. Money in integer cents (bigint). Floating point is used only inside the payment formula and rounded once to cents. */

export function monthlyPaymentCents(principalCents: bigint, annualRatePercent: number, months: number): bigint {
  if (principalCents <= 0n || !Number.isInteger(months) || months <= 0) throw new Error("invalid loan inputs");
  if (annualRatePercent < 0) throw new Error("negative rate");
  if (annualRatePercent === 0) return (principalCents + BigInt(months) / 2n) / BigInt(months);
  const r = annualRatePercent / 100 / 12;
  const p = Number(principalCents);
  const m = (p * r) / (1 - Math.pow(1 + r, -months));
  return BigInt(Math.round(m));
}

export const annualDebtServiceCents = (principal: bigint, ratePct: number, months: number): bigint => monthlyPaymentCents(principal, ratePct, months) * 12n;

/** EBITDA from tax-return lines: net income + interest + depreciation. Taxes are not added back (pass-through entities), amortization is not available. */
export const ebitdaCents = (net: bigint, interest: bigint, depreciation: bigint): bigint => net + interest + depreciation;

/** Debt service coverage ratio x1000 (integer), or null when there is no debt service. */
export function dscMilli(operatingCashFlow: bigint, debtService: bigint): bigint | null {
  if (debtService <= 0n) return null;
  return (operatingCashFlow * 1000n) / debtService;
}

export const fmtMilli = (m: bigint): string => `${m / 1000n}.${(m % 1000n).toString().padStart(3, "0")}`;
export const fmtUsd = (c: bigint): string => {
  const neg = c < 0n; const a = neg ? -c : c;
  return `${neg ? "-" : ""}$${(a / 100n).toString().replace(/\B(?=(\d{3})+(?!\d))/g, ",")}.${(a % 100n).toString().padStart(2, "0")}`;
};
