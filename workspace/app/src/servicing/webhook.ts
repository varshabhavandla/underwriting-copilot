import { createHmac, timingSafeEqual } from "node:crypto";

export const SIGNATURE_HEADER = "x-uw-signature";
export const EVENT_ID_HEADER = "x-uw-event-id";
const TOLERANCE_SECONDS = 300;

export function sign(secret: string, body: string, timestampSeconds: number): string {
  const v1 = createHmac("sha256", secret).update(`${timestampSeconds}.${body}`).digest("hex");
  return `t=${timestampSeconds},v1=${v1}`;
}

/** Verifies a signature header. Rejects stale timestamps (replay window), tampered bodies and wrong secrets, in constant time. */
export function verify(secret: string, body: string, header: string | null | undefined, nowSeconds: number): boolean {
  if (!header) return false;
  const parts = Object.fromEntries(header.split(",").map((p) => p.split("=") as [string, string]));
  const t = Number(parts["t"]);
  const v1 = parts["v1"];
  if (!Number.isInteger(t) || !v1 || Math.abs(nowSeconds - t) > TOLERANCE_SECONDS) return false;
  const expected = createHmac("sha256", secret).update(`${t}.${body}`).digest();
  const given = Buffer.from(v1, "hex");
  return given.length === expected.length && timingSafeEqual(given, expected);
}

/**
 * Subscriber URLs are configured by a lender administrator, but are still checked: https only outside local development, and no
 * loopback, link-local (cloud metadata) or private-range IP literals. DNS names that resolve to private addresses are NOT detected here
 * (rebinding), so production delivery must also run from an egress path that cannot reach internal networks.
 */
export function assertSafeWebhookUrl(raw: string, opts: { allowLocal?: boolean } = {}): URL {
  const u = new URL(raw);
  if (u.username || u.password) throw new Error("credentials in webhook URL are not allowed");
  const host = u.hostname.replace(/^\[|\]$/g, "").toLowerCase();
  const local = host === "localhost" || host === "::1" || /^127\./.test(host);
  if (opts.allowLocal && local) return u;
  if (u.protocol !== "https:") throw new Error("webhook URL must use https");
  const privateV4 = /^(10\.|127\.|0\.|169\.254\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.|100\.(6[4-9]|[7-9]\d|1[01]\d|12[0-7])\.)/;
  if (local || privateV4.test(host) || /^(fc|fd|fe80)/i.test(host) || host === "metadata.google.internal") throw new Error("webhook URL points at a non-public address");
  return u;
}

export interface WebhookTarget { url: string; secret: string; allowLocal?: boolean }

export async function postWebhook(target: WebhookTarget, event: { id: string; type: string; createdAt: string; data: unknown }, signal: AbortSignal, now: () => number = () => Date.now()): Promise<{ ok: boolean; retryable: boolean; error?: string }> {
  const url = assertSafeWebhookUrl(target.url, { allowLocal: target.allowLocal ?? false });
  const body = JSON.stringify(event);
  try {
    const res = await fetch(url, {
      method: "POST", body, signal, redirect: "error",
      headers: { "content-type": "application/json", [EVENT_ID_HEADER]: event.id, [SIGNATURE_HEADER]: sign(target.secret, body, Math.floor(now() / 1000)) },
    });
    if (res.ok) return { ok: true, retryable: false };
    // 4xx other than 408/429 means the subscriber refused the event: retrying will not help
    const retryable = res.status >= 500 || res.status === 408 || res.status === 429;
    return { ok: false, retryable, error: `subscriber responded ${res.status}` };
  } catch (e) {
    return { ok: false, retryable: true, error: (e as Error).message };
  }
}
