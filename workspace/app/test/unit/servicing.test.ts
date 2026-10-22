import { describe, expect, it } from "vitest";
import { MockServicingAdapter } from "../../src/servicing/mock";
import { assertSafeWebhookUrl, sign, verify } from "../../src/servicing/webhook";
import { backoffSeconds } from "../../src/servicing/deliver";

const pkg = { idempotencyKey: "decision:1", caseId: "c", decisionId: "d", policyVersion: "p", decidedAt: "t", borrower: { legalName: "X", einLast4: "6789" }, loan: { amountCents: "100", termMonths: 12, purposes: ["equipment"] } };
const sig = new AbortController().signal;

describe("webhook signatures", () => {
  const body = JSON.stringify({ id: "e1", type: "case.approved" });
  const t = 1_800_000_000;
  it("accepts a correct signature", () => expect(verify("s3cret", body, sign("s3cret", body, t), t + 10)).toBe(true));
  it("rejects a tampered body, a wrong secret, a stale timestamp and malformed headers", () => {
    const h = sign("s3cret", body, t);
    expect(verify("s3cret", body + " ", h, t)).toBe(false);
    expect(verify("other", body, h, t)).toBe(false);
    expect(verify("s3cret", body, h, t + 301)).toBe(false);
    expect(verify("s3cret", body, h, t - 301)).toBe(false);
    for (const bad of [null, undefined, "", "t=abc,v1=00", "v1=00", `t=${t}`, `t=${t},v1=zz`]) expect(verify("s3cret", body, bad as string, t)).toBe(false);
  });
  it("a signature cannot be moved to a different timestamp", () => {
    const h = sign("s3cret", body, t);
    expect(verify("s3cret", body, h.replace(`t=${t}`, `t=${t + 5}`), t)).toBe(false);
  });
});

describe("webhook URL safety", () => {
  it("requires https and a public address outside local development", () => {
    expect(() => assertSafeWebhookUrl("https://example.com/hook")).not.toThrow();
    for (const u of ["http://example.com/h", "https://127.0.0.1/h", "https://localhost/h", "https://169.254.169.254/latest", "https://10.0.0.5/h", "https://192.168.1.1/h", "https://172.20.0.1/h", "https://[::1]/h", "https://metadata.google.internal/x", "https://user:pw@example.com/h"]) {
      expect(() => assertSafeWebhookUrl(u), u).toThrow();
    }
  });
  it("allows loopback only when local mode is explicit", () => {
    expect(() => assertSafeWebhookUrl("http://127.0.0.1:9000/h", { allowLocal: true })).not.toThrow();
    expect(() => assertSafeWebhookUrl("http://169.254.169.254/h", { allowLocal: true })).toThrow(); // local mode does not open the metadata address
  });
});

describe("delivery helpers", () => {
  it("backoff doubles from 30 seconds and caps at one hour", () => {
    expect([1, 2, 3, 4].map(backoffSeconds)).toEqual([30, 60, 120, 240]);
    expect(backoffSeconds(20)).toBe(3600);
  });
  it("mock servicing adapter is idempotent by key (control: a different key makes a new loan)", async () => {
    const a = new MockServicingAdapter("ok");
    const r1 = await a.board(pkg, sig), r2 = await a.board(pkg, sig), r3 = await a.board({ ...pkg, idempotencyKey: "decision:2" }, sig);
    expect(r1).toEqual(r2);
    expect(r3).not.toEqual(r1);
    expect(a.boarded.size).toBe(2);
  });
});
