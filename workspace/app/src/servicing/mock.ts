import type { BoardingPackage, ServicingAdapter, ServicingResult } from "./adapter";

export type MockMode = "ok" | "fail_then_ok" | "always_transient" | "reject" | "slow";

/** In-memory stand-in for a servicing system. Idempotent by key, with failure injection for tests. */
export class MockServicingAdapter implements ServicingAdapter {
  readonly name = "mock-servicing";
  readonly boarded = new Map<string, { externalId: string; pkg: BoardingPackage }>();
  calls = 0;
  private failures = new Map<string, number>();
  constructor(private mode: MockMode = "ok", private failFirst = 2) {}
  setMode(m: MockMode): void { this.mode = m; }

  async board(pkg: BoardingPackage, signal: AbortSignal): Promise<ServicingResult> {
    this.calls++;
    if (this.mode === "slow") await new Promise((_, rej) => signal.addEventListener("abort", () => rej(new Error("aborted"))));
    if (this.mode === "reject") return { accepted: false, retryable: false, error: "loan product code not recognized" };
    if (this.mode === "always_transient") return { accepted: false, retryable: true, error: "503 service unavailable" };
    if (this.mode === "fail_then_ok") {
      const n = (this.failures.get(pkg.idempotencyKey) ?? 0) + 1;
      this.failures.set(pkg.idempotencyKey, n);
      if (n <= this.failFirst) return { accepted: false, retryable: true, error: `transient failure ${n}` };
    }
    const seen = this.boarded.get(pkg.idempotencyKey);
    if (seen) return { accepted: true, externalId: seen.externalId }; // repeat of the same request: same result, no second loan
    const externalId = `LN-${(this.boarded.size + 1).toString().padStart(6, "0")}`;
    this.boarded.set(pkg.idempotencyKey, { externalId, pkg });
    return { accepted: true, externalId };
  }
}
