import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { createServer, type Server } from "node:http";
import { assertPublicHttps, fetchPublic, guardedFetch, guardedLookup, isNonPublicAddress, UnsafeUrl } from "../../src/auth/safeFetch";
import { clearDiscoveryCache, clearKeyCache, discover, exchangeCode, authorizationUrl, keysFor, pkce, verifyIdToken, type OidcConfig } from "../../src/auth/oidc";
import { isSlug } from "../../src/admin/../auth/idp";
import { issuerAllowed } from "../../src/admin/sso";
import { startFakeIdp, type FakeIdp } from "../support/fakeIdp";

describe("addresses an administrator-supplied URL must never reach", () => {
  it.each(["10.1.2.3", "127.0.0.1", "169.254.169.254", "192.168.0.10", "172.16.5.5", "172.31.255.255", "100.64.0.1", "0.0.0.0", "224.0.0.1", "192.0.2.1", "::1", "::", "fd00::1", "fe80::1", "ff02::1", "2001:db8::1", "::ffff:10.0.0.1", "::ffff:169.254.169.254", "not-an-address"])("%s is non-public", (a) => expect(isNonPublicAddress(a)).toBe(true));
  it.each(["8.8.8.8", "1.1.1.1", "172.32.0.1", "172.15.0.1", "100.63.0.1", "100.128.0.1", "93.184.216.34", "2606:4700:4700::1111", "::ffff:8.8.8.8"])("control: %s is public", (a) => expect(isNonPublicAddress(a)).toBe(false));
});

describe("assertPublicHttps", () => {
  const dns = (map: Record<string, string[]>) => async (h: string) => { if (!map[h]) throw new Error("ENOTFOUND"); return map[h]!; };
  it("accepts https to a host that resolves only to public addresses", async () => expect((await assertPublicHttps("https://login.example.com/x", dns({ "login.example.com": ["93.184.216.34"] }))).hostname).toBe("login.example.com"));
  it("rejects http to a public host, credentials in the URL, and non-default ports", async () => {
    for (const u of ["http://login.example.com", "https://user:pw@login.example.com", "https://login.example.com:8443", "ftp://login.example.com"]) await expect(assertPublicHttps(u, dns({ "login.example.com": ["93.184.216.34"] })), u).rejects.toBeInstanceOf(UnsafeUrl);
  });
  it("rejects a name that resolves to a private address, or to a public one plus a private one", async () => {
    await expect(assertPublicHttps("https://evil.example", dns({ "evil.example": ["10.0.0.5"] }))).rejects.toThrow(/non-public/);
    await expect(assertPublicHttps("https://evil.example", dns({ "evil.example": ["93.184.216.34", "169.254.169.254"] }))).rejects.toThrow(/non-public/);
    await expect(assertPublicHttps("https://gone.example", dns({}))).rejects.toThrow(/does not resolve/);
  });
  it("rejects private IP literals and cloud metadata addresses", async () => {
    for (const u of ["https://10.0.0.1", "https://169.254.169.254/latest/meta-data", "https://[::1]", "https://[fd00::1]", "https://127.0.0.1"]) await expect(assertPublicHttps(u), u).rejects.toBeInstanceOf(UnsafeUrl);
  });
  it("allows loopback http outside production only", async () => {
    await expect(assertPublicHttps("http://127.0.0.1:4000")).resolves.toBeTruthy();
    const saved = process.env["NODE_ENV"]; (process.env as Record<string, string>)["NODE_ENV"] = "production";
    try { await expect(assertPublicHttps("http://127.0.0.1:4000")).rejects.toBeInstanceOf(UnsafeUrl); } finally { (process.env as Record<string, string>)["NODE_ENV"] = saved!; }
  });
});

describe("fetchPublic against a local server", () => {
  let srv: Server; let port = 0;
  beforeAll(async () => {
    srv = createServer((req, res) => {
      if (req.url === "/redirect") { res.writeHead(302, { location: "http://169.254.169.254/" }); return res.end(); }
      if (req.url === "/big") { res.writeHead(200); return res.end("x".repeat(400_000)); }
      if (req.url === "/slow") return void setTimeout(() => res.end("late"), 3000);
      res.writeHead(200, { "content-type": "application/json" }); res.end('{"ok":true}');
    });
    await new Promise<void>((r) => srv.listen(0, "127.0.0.1", r)); port = (srv.address() as { port: number }).port;
  });
  afterAll(async () => { srv.closeAllConnections?.(); await new Promise((r) => srv.close(r)); });
  it("returns small JSON", async () => expect((await fetchPublic(`http://127.0.0.1:${port}/`)).json()).toEqual({ ok: true }));
  it("refuses to follow a redirect (including one aimed at metadata)", async () => { await expect(fetchPublic(`http://127.0.0.1:${port}/redirect`)).rejects.toThrow(); });
  it("refuses an oversized response", async () => { await expect(fetchPublic(`http://127.0.0.1:${port}/big`, {}, { maxBytes: 100_000 })).rejects.toThrow(/too large/); });
  it("gives up on a slow provider", async () => { await expect(fetchPublic(`http://127.0.0.1:${port}/slow`, {}, { timeoutMs: 300 })).rejects.toThrow(); });
});

describe("provider key rotation", () => {
  let idp: FakeIdp;
  const cfg = (): OidcConfig => ({ issuer: idp.issuer, clientId: "c", clientSecret: "s".repeat(20), redirectUri: "http://127.0.0.1:3000/cb" });
  beforeAll(async () => { idp = await startFakeIdp({ clientId: "c", clientSecret: "s".repeat(20), redirectUri: "http://127.0.0.1:3000/cb", users: [{ sub: "u", label: "U" }] }); });
  afterAll(async () => { await idp.close(); });
  beforeEach(() => { clearDiscoveryCache(); clearKeyCache(); idp.misbehave = {}; });
  async function token() {
    const meta = await discover(cfg());
    const { verifier, challenge } = pkce();
    const r = await fetch(authorizationUrl(meta, cfg(), { state: "s", nonce: "n", challenge }) + "&fake_sub=u", { redirect: "manual" });
    const code = new URL(r.headers.get("location")!).searchParams.get("code")!;
    return { meta, idToken: await exchangeCode(meta, cfg(), code, verifier) };
  }
  it("keys are cached: many verifications cost one fetch", async () => {
    const before = idp.jwksFetches; const { meta, idToken } = await token();
    for (let i = 0; i < 3; i++) await verifyIdToken(idToken, keysFor(meta), cfg(), "n");
    expect(idp.jwksFetches - before).toBe(1);
  });
  it("a provider that rotates its signing key is followed with one refetch", async () => {
    const { meta } = await token(); await verifyIdToken((await token()).idToken, keysFor(meta), cfg(), "n");
    await idp.rotate();
    const before = idp.jwksFetches;
    await verifyIdToken((await token()).idToken, keysFor(meta), cfg(), "n");
    expect(idp.jwksFetches - before).toBe(1);
  });
  it("a stream of tokens with unknown key ids cannot make us refetch more than once per cooldown", async () => {
    const { meta } = await token(); await verifyIdToken((await token()).idToken, keysFor(meta), cfg(), "n"); // warm
    idp.misbehave = { kid: "does-not-exist" };
    const before = idp.jwksFetches; const get = keysFor(meta);
    for (let i = 0; i < 5; i++) await expect(verifyIdToken((await token()).idToken, get, cfg(), "n")).rejects.toThrow();
    expect(idp.jwksFetches - before).toBeLessThanOrEqual(1);
  });
  it("a token signed with a retired key is rejected after the provider stops publishing it", async () => {
    const { meta, idToken: old } = await token();
    await verifyIdToken(old, keysFor(meta), cfg(), "n");
    await idp.rotate(false);
    clearKeyCache();
    await expect(verifyIdToken(old, keysFor(meta), cfg(), "n")).rejects.toThrow();
  });
});

describe("organization names and issuers", () => {
  it("slugs are 3 to 40 characters of lowercase letters, digits and inner hyphens", () => {
    for (const ok of ["acme", "first-community-bank", "a1b", "x".repeat(40)]) expect(isSlug(ok), ok).toBe(true);
    for (const bad of ["", "ab", "-acme", "acme-", "Acme", "ac me", "acme/../x", "a".repeat(41), "acme_bank", "акме"]) expect(isSlug(bad), bad).toBe(false);
  });
  it("issuers must be https in production; loopback http only otherwise", () => {
    expect(issuerAllowed("https://login.example.com", true)).toBe(true);
    for (const bad of ["http://login.example.com", "javascript:alert(1)", "https://", "login.example.com", "https://a b.example"]) expect(issuerAllowed(bad, true), bad).toBe(false);
    expect(issuerAllowed("http://127.0.0.1:4000", false)).toBe(true);
    expect(issuerAllowed("http://127.0.0.1:4000", true)).toBe(false);
  });
});

describe("connection-time address pinning (DNS rebinding, B-153)", () => {
  type Cb = (e: Error | null, a?: unknown, f?: number) => void;
  const call = (l: ReturnType<typeof guardedLookup>, host: string, opts?: { all?: boolean }) => new Promise<{ err: Error | null; addr?: unknown }>((r) => l(host, opts, ((err: Error | null, addr: unknown) => r({ err, addr })) as Cb));
  it("hands back only the addresses it validated, in both call styles", async () => {
    const l = guardedLookup(async () => ["93.184.216.34", "2606:4700:4700::1111"]);
    expect((await call(l, "x.example", { all: true })).addr).toEqual([{ address: "93.184.216.34", family: 4 }, { address: "2606:4700:4700::1111", family: 6 }]);
    expect((await call(l, "x.example")).addr).toBe("93.184.216.34");
  });
  it("refuses a name that resolves to anything non-public, even among public answers", async () => {
    for (const answers of [["127.0.0.1"], ["93.184.216.34", "10.0.0.1"], ["169.254.169.254"], ["::1"], []]) {
      const r = await call(guardedLookup(async () => answers), "x.example", { all: true });
      expect(r.err, JSON.stringify(answers)).toBeInstanceOf(UnsafeUrl);
    }
  });
  it("passes resolver failures through", async () => expect((await call(guardedLookup(async () => { throw new Error("ENOTFOUND"); }), "x.example")).err?.message).toBe("ENOTFOUND"));
  it("a name that is public when checked but private when connected is refused at connect time", async () => {
    let calls = 0;
    const rebinding = async () => (++calls === 1 ? ["93.184.216.34"] : ["127.0.0.1"]);
    const err = await guardedFetch("https://rebind.example/hook", {}, { resolve: rebinding }).then(() => null, (e: Error & { cause?: Error }) => e);
    expect(err).not.toBeNull();
    const text = `${err!.message} ${(err as { cause?: Error }).cause?.message ?? ""}`;
    expect(text).toMatch(/non-public/);
    expect(text).not.toMatch(/ECONNREFUSED|ETIMEDOUT/); // it never tried to connect
    expect(calls).toBeGreaterThanOrEqual(2);
  });
});
