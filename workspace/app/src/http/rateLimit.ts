/**
 * Sliding-window limiter, per process. It protects one instance; on a multi-instance deployment the real limit belongs at the edge
 * (platform firewall or a shared store), so treat this as a backstop, not the control.
 */
export class RateLimiter {
  private hits = new Map<string, number[]>();
  constructor(private readonly max: number, private readonly windowMs: number, private readonly maxKeys = 10_000) {}

  check(key: string, nowMs: number): { ok: true } | { ok: false; retryAfterSeconds: number } {
    const from = nowMs - this.windowMs;
    const recent = (this.hits.get(key) ?? []).filter((t) => t > from);
    if (recent.length >= this.max) {
      this.hits.set(key, recent);
      return { ok: false, retryAfterSeconds: Math.max(1, Math.ceil((recent[0]! + this.windowMs - nowMs) / 1000)) };
    }
    recent.push(nowMs);
    if (!this.hits.has(key) && this.hits.size >= this.maxKeys) this.prune(from);
    if (!this.hits.has(key) && this.hits.size >= this.maxKeys) return { ok: false, retryAfterSeconds: 1 }; // fail closed under key flooding
    this.hits.set(key, recent);
    return { ok: true };
  }

  private prune(from: number): void {
    for (const [k, v] of this.hits) if (v.every((t) => t <= from)) this.hits.delete(k);
  }
}
