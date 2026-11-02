import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { RateLimiter } from "../../src/http/rateLimit";
import { clientKeyOf, readJson, withRequest } from "../../src/http/withRequest";
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
  beforeEach(() => { reset(); process.env["TRUSTED_PROXY_HOPS"] = "1"; });
  afterAll(() => { delete process.env["TRUSTED_PROXY_HOPS"]; });
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
      "const k = 'AKIA" + "ABCDEFGHIJKLMNOP';",
      "-----BEGIN RSA " + "PRIVATE KEY-----",
      "token: ghp_" + "abcdefghijklmnopqrstuvwxyz0123456789",
      "DATABASE_URL=postgres://admin:" + "s3cretPassw0rd@db.example.com/app",
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

describe("security headers", () => {
  const cfg = readFileSync(join(import.meta.dirname, "..", "..", "next.config.ts"), "utf8");
  it("keeps same-origin referrers so browser form posts carry a real Origin (no-referrer breaks server actions)", () => {
    expect(cfg).toMatch(/Referrer-Policy", value: "same-origin"/);
    expect(cfg).not.toMatch(/value: "no-referrer"/);
  });
  it("sets the baseline headers", () => {
    for (const h of ["X-Content-Type-Options", "X-Frame-Options", "Strict-Transport-Security", "Cross-Origin-Opener-Policy", "Content-Security-Policy"]) expect(cfg).toContain(h);
  });
});

describe("route policy (authentication)", () => {
  const walk2 = (d: string): string[] => readdirSync(d).flatMap((f) => { const p = join(d, f); return statSync(p).isDirectory() ? walk2(p) : p.endsWith("route.ts") ? [p] : []; });
  const routes2 = walk2(join(import.meta.dirname, "..", "..", "app", "api"));
  // routes that are public or authenticate by other means, each with the reason
  const OTHER = new Map([["health", "public liveness"], ["metrics", "bearer secret"], ["outbox/deliver", "worker secret"], ["auth/login", "starts sign-in"], ["auth/callback", "completes sign-in"], ["auth/logout", "session plus Origin check"]]);
  it.each(routes2.map((r) => [r.split("/app/api/")[1]!.replace(/\/route\.ts$/, ""), r]))("%s either checks the caller's role or is a documented exception", (name, path) => {
    const src = readFileSync(path, "utf8");
    if (OTHER.has(name!)) return;
    expect(src, `${name} must call services() and deny(...)`).toMatch(/await services\(\)/);
    expect(src).toMatch(/deny\(s, "(view|intake|build|decide|deliver|admin|account)"\)/);
  });
  it("control: the exceptions are real routes", () => { for (const k of OTHER.keys()) expect(routes2.some((r) => r.includes(`/api/${k}/route.ts`)), k).toBe(true); });
});

describe("page policy (authentication)", () => {
  const walkP = (d: string): string[] => readdirSync(d).flatMap((f) => { const p = join(d, f); return statSync(p).isDirectory() ? (p.endsWith("/api") ? [] : walkP(p)) : p.endsWith("page.tsx") ? [p] : []; });
  const pages = walkP(join(import.meta.dirname, "..", "..", "app"));
  const PUBLIC = new Map([["forbidden", "tells the visitor they have no access; contains no data"], ["signin", "where anonymous visitors start; contains no data"], ["signin/continue", "same-site hop to the login route; contains no data"], ["signed-out", "landing page after sign-out; contains no data"]]);
  it("finds the pages", () => expect(pages.length).toBeGreaterThanOrEqual(6));
  it.each(pages.map((p) => [p.split("/app/app/")[1]!.replace(/\/?page\.tsx$/, "") || "(home)", p]))("page %s requires a session or is a documented public page", (name, path) => {
    if (PUBLIC.has(name!)) return;
    expect(readFileSync(path, "utf8"), `${name} must call requireSession`).toMatch(/requireSession\(/);
  });
  it("administration pages require the admin role", () => {
    for (const p of pages.filter((x) => x.includes("/admin/"))) expect(readFileSync(p, "utf8")).toMatch(/requireSession\("admin"/);
  });
  it("control: the public page list names a real page", () => { for (const k of PUBLIC.keys()) expect(pages.some((p) => p.includes(`/app/${k}/page.tsx`)), k).toBe(true); });
});

describe("client identity for rate limiting (ASVS V4.1.3, V15.3.4)", () => {
  const req = (xff?: string) => new Request("http://x/", { headers: xff === undefined ? {} : { "x-forwarded-for": xff } });
  it("ignores X-Forwarded-For entirely when no proxy is trusted: a caller cannot choose their own identity", () => {
    expect(clientKeyOf(req("203.0.113.9"), 0)).toBe("unknown");
    expect(clientKeyOf(req("1.1.1.1, 2.2.2.2"), 0)).toBe("unknown");
    expect(clientKeyOf(req(), 0)).toBe("unknown");
  });
  it("with one trusted proxy, takes the last entry (the one the proxy added), whatever the caller wrote before it", () => {
    expect(clientKeyOf(req("198.51.100.7"), 1)).toBe("198.51.100.7");
    expect(clientKeyOf(req("6.6.6.6, 7.7.7.7, 198.51.100.7"), 1)).toBe("198.51.100.7");
  });
  it("spoofing the left side does not change the identity or evade the limit", () => {
    expect(clientKeyOf(req("1.2.3.4, 198.51.100.7"), 1)).toBe(clientKeyOf(req("9.9.9.9, 198.51.100.7"), 1));
  });
  it("with two trusted hops, takes the second from the right", () => {
    expect(clientKeyOf(req("6.6.6.6, 198.51.100.7, 10.0.0.2"), 2)).toBe("198.51.100.7");
  });
  it("falls back to the shared bucket when the list is shorter than the trusted hops, empty, or not an address", () => {
    expect(clientKeyOf(req("198.51.100.7"), 2)).toBe("unknown");
    expect(clientKeyOf(req(), 1)).toBe("unknown");
    expect(clientKeyOf(req("not-an-ip"), 1)).toBe("unknown");
    expect(clientKeyOf(req("1.2.3.4, <script>"), 1)).toBe("unknown");
  });
  it("accepts IPv6 and rejects an oversized or malformed one", () => {
    expect(clientKeyOf(req("2001:db8::1"), 1)).toBe("2001:db8::1");
    expect(clientKeyOf(req("2001:db8::1::2"), 1)).toBe("unknown");
  });
  it("the hop count comes from TRUSTED_PROXY_HOPS and defaults to untrusted", () => {
    const saved = process.env["TRUSTED_PROXY_HOPS"];
    try {
      delete process.env["TRUSTED_PROXY_HOPS"]; expect(clientKeyOf(req("198.51.100.7"))).toBe("unknown");
      process.env["TRUSTED_PROXY_HOPS"] = "1"; expect(clientKeyOf(req("198.51.100.7"))).toBe("198.51.100.7");
      process.env["TRUSTED_PROXY_HOPS"] = "banana"; expect(clientKeyOf(req("198.51.100.7"))).toBe("unknown");
      process.env["TRUSTED_PROXY_HOPS"] = "99"; expect(clientKeyOf(req("198.51.100.7"))).toBe("unknown");
    } finally { if (saved === undefined) delete process.env["TRUSTED_PROXY_HOPS"]; else process.env["TRUSTED_PROXY_HOPS"] = saved; }
  });
});
