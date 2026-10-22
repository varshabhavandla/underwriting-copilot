import { randomUUID } from "node:crypto";
import { isIP } from "node:net";
import { log } from "../observability/log";
import { inc } from "../observability/metrics";
import { RateLimiter } from "./rateLimit";

export interface RequestInfo { requestId: string; route: string; clientKey: string }
export interface RouteOptions {
  /** Requests per window per client. Required: every API route must declare a limit. */
  limit: { max: number; windowMs: number };
  /** Require Content-Type: application/json on POST (defeats cross-site form posts). */
  json?: boolean;
}

const limiters = new Map<string, RateLimiter>();
const ID = /^[A-Za-z0-9_-]{8,64}$/;

/** How many reverse proxies sit in front of the app and append to X-Forwarded-For. 0 means the header cannot be trusted at all. */
export const trustedProxyHops = (): number => {
  const n = Number(process.env["TRUSTED_PROXY_HOPS"] ?? 0);
  return Number.isInteger(n) && n >= 0 && n <= 5 ? n : 0;
};

/**
 * The rate-limit identity of a caller. X-Forwarded-For is a list that every proxy appends to, and a caller can write anything into the part it
 * controls, so only the entry added by our own outermost trusted proxy counts: the hops-th entry from the right. With no trusted proxy (hops 0) or
 * a list shorter than that, every caller shares one bucket: the limit then protects the service without trying to tell callers apart, rather than
 * letting an attacker choose their own identity. On Vercel the platform overwrites the header with the client's address, so one hop (S-55).
 */
export const clientKeyOf = (req: Request, hops: number = trustedProxyHops()): string => {
  if (hops <= 0) return "unknown";
  const parts = (req.headers.get("x-forwarded-for") ?? "").split(",").map((p) => p.trim()).filter(Boolean);
  const ip = parts.length >= hops ? parts[parts.length - hops] : undefined;
  return ip && isIP(ip) ? ip : "unknown";
};

/**
 * Wraps an API route: request id, per-client rate limit, content-type check, access log, metrics, and an error boundary that never
 * leaks internals. Every file under app/api must use it (a test enforces this).
 */
export function withRequest<C>(route: string, opts: RouteOptions, handler: (req: Request, ctx: C, info: RequestInfo) => Promise<Response>): (req: Request, ctx: C) => Promise<Response> {
  const limiter = limiters.get(route) ?? new RateLimiter(opts.limit.max, opts.limit.windowMs);
  limiters.set(route, limiter);
  return async (req, ctx) => {
    const started = Date.now();
    const supplied = req.headers.get("x-request-id");
    const requestId = supplied && ID.test(supplied) ? supplied : randomUUID();
    const info: RequestInfo = { requestId, route, clientKey: clientKeyOf(req) };
    const done = (res: Response): Response => {
      const out = new Response(res.body, res);
      out.headers.set("x-request-id", requestId);
      inc("http_requests_total", { route, status: String(res.status) });
      log("info", "request", { route, method: req.method, status: res.status, durationMs: Date.now() - started, requestId });
      return out;
    };
    const rl = limiter.check(`${route}|${info.clientKey}`, Date.now());
    if (!rl.ok) return done(Response.json({ error: "rate_limited" }, { status: 429, headers: { "retry-after": String(rl.retryAfterSeconds) } }));
    if (opts.json && req.method === "POST" && !(req.headers.get("content-type") ?? "").toLowerCase().startsWith("application/json")) {
      return done(Response.json({ error: "content-type must be application/json" }, { status: 415 }));
    }
    try {
      return done(await handler(req, ctx, info));
    } catch (e) {
      log("error", "unhandled error", { route, requestId, error: e });
      return done(Response.json({ error: "internal", requestId }, { status: 500 }));
    }
  };
}

/** Reads a JSON body with a hard size cap, before parsing. */
export async function readJson(req: Request, maxBytes: number): Promise<{ ok: true; value: unknown } | { ok: false; status: 400 | 413 }> {
  const text = await req.text();
  if (Buffer.byteLength(text) > maxBytes) return { ok: false, status: 413 };
  try { return { ok: true, value: JSON.parse(text) }; } catch { return { ok: false, status: 400 }; }
}
