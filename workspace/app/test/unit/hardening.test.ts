import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { beforeEach, describe, expect, it } from "vitest";
import { RateLimiter } from "../../src/http/rateLimit";
import { readJson, withRequest } from "../../src/http/withRequest";
import { log, scrub, setLevel, setSink } from "../../src/observability/log";
import { inc, render, reset } from "../../src/observability/metrics";
import { scanText } from "../../scripts/secret-scan";

describe("log scrubbing", () => {
  it("masks sensitive field names, redacts identifier patterns inside strings, and never prints raw bodies", () => {
    const out = JSON.stringify(scrub({ ein: "12-3456789", note: "call 555-123-4567 or mail a@b.example, SSN 123-45-6789, Account number: 000123456789", legalName: "Acme", body: { x: 1 }, requestId: "abc", status: 200, nested: { password: "p", ok: "fine" } }));
    for (const raw of ["12-3456789", "555-123-4567", "a@b.example", "123-45-6789", "000123456789", "Acme", "\"p\""]) expect(out).not.toContain(raw);
    expect(out).toContain("abc");
    expect(out).toContain("fine");
  });
  it("serializes errors without leaking identifiers in the message, and truncates long strings", () => {
    const e = JSON.stringify(scrub(new Error("failed for 123-45-6789")));
    expect(e).not.toContain("123-45-6789");
    expect((scrub("x".repeat(1000)) as string).length).toBeLessThan(400);
  });
  it("respects the minimum level and writes one JSON object per line", () => {
    const lines: string[] = [];
    setSink((l) => lines.push(l)); setLevel("warn");
    log("info", "hidden"); log("error", "shown", { route: "r", token: "t0k3n" });
    setLevel("info");
    expect(lines).toHaveLength(1);
    const o = JSON.parse(lines[0]!);
    expect(o).toMatchObject({ level: "error", msg: "shown", route: "r", token: "[redacted]" });
    setSink((l) => console.log(l));
  });
});

describe("rate limiter", () => {
  it("allows up to the limit in a window, then refuses with a retry time, then recovers", () => {
    const r = new RateLimiter(3, 1000);
    expect([0, 100, 200].map((t) => r.check("k", t).ok)).toEqual([true, true, true]);
    const blocked = r.check("k", 300);
    expect(blocked).toMatchObject({ ok: false });
    expect((blocked as { retryAfterSeconds: number }).retryAfterSeconds).toBeGreaterThanOrEqual(1);
    expect(r.check("other", 300).ok).toBe(true); // control: other clients unaffected
    expect(r.check("k", 1201).ok).toBe(true);
  });
  it("fails closed when flooded with new keys", () => {
    const r = new RateLimiter(5, 60_000, 3);
    for (const k of ["a", "b", "c"]) expect(r.check(k, 0).ok).toBe(true);
    expect(r.check("d", 1).ok).toBe(false);
    expect(r.check("a", 2).ok).toBe(true); // existing clients still served
  });
});

describe("withRequest", () => {
  beforeEach(() => reset());
  const req = (init: RequestInit & { ip?: string } = {}) => new Request("http://x/api/t", { method: "POST", ...init, headers: { "x-forwarded-for": init.ip ?? "1.2.3.4", ...(init.headers as Record<string, string>) } });
  it("echoes a valid request id, replaces an invalid one, and counts the request", async () => {
    const h = withRequest("t1", { limit: { max: 100, windowMs: 1000 } }, async () => Response.json({ ok: true }));
    expect((await h(req({ headers: { "x-request-id": "abcd1234" } }), {})).headers.get("x-request-id")).toBe("abcd1234");
    const bad = (await h(req({ headers: { "x-request-id": "bad id!\n" } }), {})).headers.get("x-request-id")!;
    expect(bad).toMatch(/^[0-9a-f-]{36}$/);
    expect(render()).toContain('http_requests_total{route="t1",status="200"} 2');
  });
  it("rate limits per client with 429 and Retry-After, and does not affect another client", async () => {
    const h = withRequest("t2", { limit: { max: 2, windowMs: 60_000 } }, async () => Response.json({ ok: true }));
    expect([await h(req(), {}), await h(req(), {})].map((r) => r.status)).toEqual([200, 200]);
    const third = await h(req(), {});
    expect(third.status).toBe(429);
    expect(third.headers.get("retry-after")).toBeTruthy();
    expect((await h(req({ ip: "9.9.9.9" }), {})).status).toBe(200);
  });
  it("requires application/json on POST when declared, and passes a JSON post", async () => {
    const h = withRequest("t3", { limit: { max: 100, windowMs: 1000 }, json: true }, async () => Response.json({ ok: true }));
    expect((await h(req({ headers: { "content-type": "application/x-www-form-urlencoded" }, body: "a=1" }), {})).status).toBe(415);
    expect((await h(req({ headers: { "content-type": "text/plain" } }), {})).status).toBe(415);
    expect((await h(req({ headers: { "content-type": "application/json; charset=utf-8" }, body: "{}" }), {})).status).toBe(200);
  });
  it("turns a thrown error into a 500 with a request id and no internals", async () => {
    const lines: string[] = []; setSink((l) => lines.push(l));
    const h = withRequest("t4", { limit: { max: 100, windowMs: 1000 } }, async () => { throw new Error("db password=hunter2 for 123-45-6789"); });
    const res = await h(req(), {});
    const body = await res.json();
    expect(res.status).toBe(500);
    expect(JSON.stringify(body)).not.toMatch(/hunter2|123-45-6789|password/);
    expect(body.requestId).toBeTruthy();
    expect(lines.join("\n")).not.toContain("123-45-6789");
    setSink((l) => console.log(l));
  });
  it("readJson enforces the size cap before parsing and distinguishes bad JSON", async () => {
    expect(await readJson(new Request("http://x", { method: "POST", body: "a".repeat(100) }), 50)).toEqual({ ok: false, status: 413 });
    expect(await readJson(new Request("http://x", { method: "POST", body: "{nope" }), 50)).toEqual({ ok: false, status: 400 });
    expect(await readJson(new Request("http://x", { method: "POST", body: "{\"a\":1}" }), 50)).toEqual({ ok: true, value: { a: 1 } });
  });
});

describe("metrics", () => {
  beforeEach(() => reset());
  it("renders prometheus text, escapes label values, and caps label cardinality", () => {
    inc("things_total", { kind: 'a"b' }); inc("things_total", { kind: 'a"b' });
    expect(render()).toContain('things_total{kind="a\\"b"} 2');
    for (let i = 0; i < 600; i++) inc("flood_total", { id: String(i) });
    expect(render().split("\n").filter((l) => l.startsWith("flood_total")).length).toBeLessThanOrEqual(500);
    expect(() => inc("Bad-Name")).toThrow();
  });
});

describe("secret scan", () => {
  it("finds common secrets and credential URLs, and honors the allow marker and dev passwords", () => {
    const planted = [
      "const k = 'AKIAABCDEFGHIJKLMNOP';",
      "-----BEGIN RSA PRIVATE KEY-----",
      "token: ghp_abcdefghijklmnopqrstuvwxyz0123456789",
      "DATABASE_URL=postgres://admin:s3cretPassw0rd@db.example.com/app",
      "api_key = \"abcdefghijklmnopqrstuvwxyz123456\"",
    ].join("\n");
    expect(scanText("f.ts", planted).map((f) => f.rule).sort()).toEqual(["assigned-secret", "aws-access-key", "github-token", "private-key", "url-credentials"]);
    expect(scanText("f.ts", "postgres://uw_app:uw_app_dev@127.0.0.1/db\nconst k = 'AKIAABCDEFGHIJKLMNOP'; // secret-scan:allow")).toEqual([]);
  });
});

describe("route policy (every API route is wrapped)", () => {
  const walk = (d: string): string[] => readdirSync(d).flatMap((f) => { const p = join(d, f); return statSync(p).isDirectory() ? walk(p) : p.endsWith("route.ts") ? [p] : []; });
  const routes = walk(join(import.meta.dirname, "..", "..", "app", "api"));
  it("finds the routes", () => expect(routes.length).toBeGreaterThanOrEqual(7));
  it.each(routes.map((r) => [r.split("/app/api/")[1]!, r]))("%s uses withRequest with a rate limit, exports no bare handler, and does not call console", (_n, path) => {
    const src = readFileSync(path, "utf8");
    expect(src).toMatch(/export const (GET|POST) = withRequest\(/);
    expect(src).toMatch(/limit: \{ max: [\d_]+, windowMs: [\d_]+ \}/);
    expect(src).not.toMatch(/export (async )?function (GET|POST|PUT|PATCH|DELETE)/);
    expect(src).not.toMatch(/\bconsole\.(log|error|warn|info|debug)\(/);
  });
});
