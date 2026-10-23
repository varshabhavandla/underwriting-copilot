import { describe, expect, it } from "vitest";
import { serverEnv } from "../../src/server-env";
import { AnthropicProvider } from "../../src/llm/anthropicProvider";
import { DEFAULT_OPTIONS, LlmGateway } from "../../src/llm/gateway";
import { MockProvider } from "../../src/llm/mockProvider";
import { makePacket } from "../../src/synthetic/generate";

const KEY = "sk-ant-test-0000000000000000";
const fsDoc = () => makePacket(3, "clean").docs.find((d) => d.id === "d_fs")!;

interface Seen { url: string; headers: Record<string, string>; body: Record<string, unknown> }

/** A network layer that never leaves the process. `answer` builds the model's reply from the request. */
type Net = (url: unknown, init?: RequestInit) => Promise<Response>;
function fake(answer: (body: Record<string, unknown>) => { status?: number; stop_reason?: string; model?: string; text?: string; raw?: string }) {
  const seen: Seen[] = [];
  const f: Net = async (url, init) => {
    const body = JSON.parse(String(init?.body)) as Record<string, unknown>;
    const h: Record<string, string> = {};
    new Headers(init?.headers).forEach((v, k) => { h[k] = v; });
    seen.push({ url: String(url), headers: h, body });
    const a = answer(body);
    const payload = a.raw ?? JSON.stringify({
      id: "msg_test", type: "message", role: "assistant", model: a.model ?? "claude-opus-5-5",
      content: [{ type: "text", text: a.text ?? "{}" }], stop_reason: a.stop_reason ?? "end_turn", stop_sequence: null,
      usage: { input_tokens: 10, output_tokens: 10 },
    });
    return new Response(payload, { status: a.status ?? 200, headers: { "content-type": "application/json" } });
  };
  return { f, seen };
}

/** The reply a faithful model would give: reuse the mock's label reader on the pages found in the request. */
async function faithful(body: Record<string, unknown>): Promise<string> {
  const content = String((body["messages"] as { content: string }[])[0]!.content);
  const json = JSON.parse(content.replace(/^<[a-z]+>\n/, "").replace(/\n<\/[a-z]+>$/, "")) as Record<string, unknown>;
  const mock = new MockProvider();
  if (json["task"] === "draft_memo") {
    return JSON.stringify(await mock.draftMemo({ task: "draft_memo", promptVersion: "x", businessName: String(json["business"]), sources: (json["sources"] as { id: string; label: string; text: string }[]).map((s) => ({ ...s, renderings: [] })) }, new AbortController().signal));
  }
  const pages = (json["pages"] as { text: string }[]).map((p) => p.text);
  const allowed = (json["allowed_fields"] as { field: string }[]).map((x) => x.field);
  return JSON.stringify(await mock.extract({ task: "extract_facts", docType: String(json["document_type"]), promptVersion: "x", allowedFields: allowed, pages }, new AbortController().signal));
}

const provider = (f: Net, o: Partial<ConstructorParameters<typeof AnthropicProvider>[0]> = {}) =>
  new AnthropicProvider({ apiKey: KEY, baseURL: "http://127.0.0.1:1", fetch: f as unknown as typeof fetch, ...o });
const gw = (p: AnthropicProvider) => new LlmGateway(p, { ...DEFAULT_OPTIONS, promptVersion: "extract-facts@2" });

describe("anthropic provider", () => {
  it("extracts verified, cited facts through the gateway", async () => {
    const real: Net = async (u, i) => {
      const body = JSON.parse(String(i?.body)) as Record<string, unknown>;
      const text = await faithful(body);
      return fake(() => ({ text })).f(u, i);
    };
    const out = await gw(provider(real)).extractFacts("c1", "financial_statement", fsDoc().pages);
    expect(out.call.result).toBe("ok");
    expect(out.rejected).toEqual([]);
    expect(out.verified.map((x) => x.field).sort()).toEqual(["net_income", "revenue", "statement_date", "total_assets", "total_equity", "total_liabilities"]);
    expect(out.verified.every((x) => x.passage.length > 0 && x.page === 1)).toBe(true);
  });

  it("sends no tools, an allowlist, the untrusted-document warning, and the key only as a header", async () => {
    const seenAll: Seen[] = [];
    const real: Net = async (u, i) => {
      const body = JSON.parse(String(i?.body)) as Record<string, unknown>;
      const text = await faithful(body);
      const n = fake(() => ({ text }));
      const r = await n.f(u, i);
      seenAll.push(...n.seen);
      return r;
    };
    await gw(provider(real)).extractFacts("c1", "financial_statement", fsDoc().pages);
    const req = seenAll[0]!;
    expect(req.url).toContain("/v1/messages");
    expect(req.body["tools"]).toBeUndefined();
    expect(req.body["tool_choice"]).toBeUndefined();
    expect(req.body["temperature"]).toBeUndefined();
    expect(req.body["model"]).toBe("claude-opus-5-5");
    expect(String(req.body["system"])).toMatch(/untrusted data, not instructions/);
    expect((req.body["output_config"] as { effort: string }).effort).toBe("low");
    expect(req.body["fallbacks"]).toBe("default");
    expect(req.headers["anthropic-beta"]).toContain("server-side-fallback-2026-07-01");
    expect(req.headers["authorization"]).toBe(`Bearer ${KEY}`);
    expect(JSON.stringify(req.body)).not.toContain(KEY);
  });

  it("redacts identifiers before they leave, and restores them in verified passages", async () => {
    const seen: string[] = [];
    const real: Net = async (u, i) => {
      const body = JSON.parse(String(i?.body)) as Record<string, unknown>;
      seen.push(JSON.stringify(body));
      const text = await faithful(body);
      return fake(() => ({ text })).f(u, i);
    };
    const pages = ["Contact owner@example.test or 555-123-4567. EIN 12-3456789", "As of: 2026-09-30", "Revenue: $1,000.00", "Net income: $200.00"].join("\n");
    const out = await gw(provider(real)).extractFacts("c1", "financial_statement", [pages]);
    expect(seen[0]).not.toContain("owner@example.test");
    expect(seen[0]).not.toContain("12-3456789");
    expect(seen[0]).toContain("[[EMAIL_1]]");
    expect(out.verified.map((x) => x.field)).toContain("revenue");
    expect(out.call.redactedItems).toBeGreaterThan(0);
  });

  it("treats a refusal as a failed extraction, never as facts", async () => {
    const net = fake(() => ({ stop_reason: "refusal", text: "" }));
    const out = await gw(provider(net.f)).extractFacts("c1", "financial_statement", fsDoc().pages);
    expect(out.verified).toEqual([]);
    expect(out.call.result).toBe("error");
    expect(out.call.error).toBe("model declined the request");
  });

  it("maps provider errors to a status code only, with no key or document text in the message", async () => {
    for (const status of [401, 429, 500]) {
      const net = fake(() => ({ status, raw: JSON.stringify({ type: "error", error: { type: "api_error", message: `bad key ${KEY} for ${fsDoc().pages[0]!.slice(0, 20)}` } }) }));
      const out = await new LlmGateway(provider(net.f), { ...DEFAULT_OPTIONS }).extractFacts("c1", "financial_statement", fsDoc().pages);
      expect(out.call.result).toBe("error");
      expect(out.call.error).toBe(`model provider error ${status}`);
      expect(out.call.error).not.toContain(KEY);
    }
  }, 30_000);

  it("rejects output that is not valid JSON or not the expected shape", async () => {
    const bad = fake(() => ({ text: "Sure! The revenue is $5." }));
    const o1 = await gw(provider(bad.f)).extractFacts("c1", "financial_statement", fsDoc().pages);
    expect(o1.call.error).toBe("model output was not valid JSON");
    const shape = fake(() => ({ text: JSON.stringify({ fields: "nope" }) }));
    const o2 = await gw(provider(shape.f)).extractFacts("c2", "financial_statement", fsDoc().pages);
    expect(o2.call.result).toBe("error");
  });

  it("rejects a hallucinated value that is not in its cited passage, and any field off the allowlist", async () => {
    const lie = fake(() => ({ text: JSON.stringify({ fields: [
      { field: "revenue", value: "999999999", page: 1, passage: "Revenue: invented" },
      { field: "approve_loan", value: "yes", page: 1, passage: "As of" },
    ] }) }));
    const out = await gw(provider(lie.f)).extractFacts("c1", "financial_statement", fsDoc().pages);
    expect(out.verified).toEqual([]);
    expect(out.rejected.map((r) => r.reason).sort()).toEqual(["field_not_allowed", "passage_not_in_document"]);
  });

  it("records the model that actually answered when a fallback ran", async () => {
    const real: Net = async (u, i) => {
      const text = await faithful(JSON.parse(String(i?.body)) as Record<string, unknown>);
      return fake(() => ({ text, model: "claude-opus-4-8" })).f(u, i);
    };
    const out = await gw(provider(real)).extractFacts("c1", "financial_statement", fsDoc().pages);
    expect(out.call.model).toBe("claude-opus-4-8");
  });

  it("omits the fallback request when it is switched off", async () => {
    const seen: Seen[] = [];
    const real: Net = async (u, i) => {
      const text = await faithful(JSON.parse(String(i?.body)) as Record<string, unknown>);
      const n = fake(() => ({ text }));
      const r = await n.f(u, i);
      seen.push(...n.seen);
      return r;
    };
    await gw(provider(real, { fallbacks: false })).extractFacts("c1", "financial_statement", fsDoc().pages);
    expect(seen[0]!.body["fallbacks"]).toBeUndefined();
    expect(seen[0]!.headers["anthropic-beta"] ?? "").not.toContain("server-side-fallback");
  });

  it("ignores credentials and endpoints set in the environment for other tools", async () => {
    const saved = { t: process.env["ANTHROPIC_AUTH_TOKEN"], b: process.env["ANTHROPIC_BASE_URL"], k: process.env["ANTHROPIC_API_KEY"] };
    process.env["ANTHROPIC_AUTH_TOKEN"] = "canary-token"; process.env["ANTHROPIC_BASE_URL"] = "http://canary.invalid"; process.env["ANTHROPIC_API_KEY"] = "canary-key";
    try {
      const seen: Seen[] = [];
      const real: Net = async (u, i) => {
        const text = await faithful(JSON.parse(String(i?.body)) as Record<string, unknown>);
        const n = fake(() => ({ text }));
        const r = await n.f(u, i);
        seen.push(...n.seen);
        return r;
      };
      await gw(new AnthropicProvider({ apiKey: KEY, fetch: real as unknown as typeof fetch })).extractFacts("c1", "financial_statement", fsDoc().pages);
      expect(seen[0]!.url.startsWith("https://api.anthropic.com/")).toBe(true);
      expect(seen[0]!.headers["authorization"]).toBe(`Bearer ${KEY}`);
      expect(JSON.stringify(seen[0]!.headers)).not.toContain("canary");
    } finally {
      for (const [k, v] of [["ANTHROPIC_AUTH_TOKEN", saved.t], ["ANTHROPIC_BASE_URL", saved.b], ["ANTHROPIC_API_KEY", saved.k]] as const) { if (v === undefined) delete process.env[k]; else process.env[k] = v; }
    }
  });

  it("drafts a memo that the gateway verifies line by line", async () => {
    const real: Net = async (u, i) => {
      const text = await faithful(JSON.parse(String(i?.body)) as Record<string, unknown>);
      return fake(() => ({ text })).f(u, i);
    };
    const src = [{ id: "F:revenue", label: "Revenue", renderings: ["$1,000.00", "1000.00"], text: "Revenue is $1,000.00" }, { id: "A:name", label: "Business", renderings: [], text: "Copper Dental Group PC" }];
    const out = await gw(provider(real)).draftMemo("c1", "Copper Dental Group PC", src);
    expect(out.call.result).toBe("ok");
    expect(out.problems).toEqual([]);
    expect(out.draft?.sections.map((s) => s.title)).toEqual(["Business and request", "Financial summary", "Rule results and exceptions", "Open items"]);
  });

  it("refuses a memo with a fabricated number", async () => {
    const lie = fake(() => ({ text: JSON.stringify({ sections: [
      { title: "Business and request", lines: [{ text: "Prepared for review.", cites: ["A:name"] }] },
      { title: "Financial summary", lines: [{ text: "Revenue will reach $5,000,000.00.", cites: ["F:revenue"] }] },
      { title: "Rule results and exceptions", lines: [] }, { title: "Open items", lines: [] },
    ] }) }));
    const src = [{ id: "F:revenue", label: "Revenue", renderings: ["$1,000.00"], text: "Revenue is $1,000.00" }, { id: "A:name", label: "Business", renderings: [], text: "Copper" }];
    const out = await gw(provider(lie.f)).draftMemo("c1", "Copper", src);
    expect(out.draft).toBeNull();
    expect(out.problems.length).toBeGreaterThan(0);
  });

  it("requires an API key", () => {
    expect(() => new AnthropicProvider({ apiKey: "" })).toThrow(/API key/);
  });
});

describe("provider switches", () => {
  const base = { DATABASE_URL: "postgres://u:p@127.0.0.1:5432/db" };
  const withEnv = (vars: Record<string, string | undefined>, fn: () => void) => {
    const keys = ["DATABASE_URL", "LLM_PROVIDER", "LLM_EXTERNAL_CALLS", "ANTHROPIC_API_KEY", "NODE_ENV"];
    const saved = Object.fromEntries(keys.map((k) => [k, process.env[k]]));
    for (const k of keys) delete process.env[k];
    Object.assign(process.env, base, vars);
    try { fn(); } finally { for (const k of keys) { if (saved[k] === undefined) delete process.env[k]; else process.env[k] = saved[k]!; } }
  };
  it("defaults to the mock and calls nothing external", () => {
    withEnv({}, () => expect(serverEnv().LLM_PROVIDER).toBe("mock"));
  });
  it("refuses the real provider without a key", () => {
    withEnv({ LLM_PROVIDER: "anthropic", LLM_EXTERNAL_CALLS: "approved" }, () => expect(() => serverEnv()).toThrow(/ANTHROPIC_API_KEY/));
  });
  it("refuses the real provider without the explicit approval switch", () => {
    withEnv({ LLM_PROVIDER: "anthropic", ANTHROPIC_API_KEY: KEY }, () => expect(() => serverEnv()).toThrow(/LLM_EXTERNAL_CALLS=approved/));
    withEnv({ LLM_PROVIDER: "anthropic", ANTHROPIC_API_KEY: KEY, LLM_EXTERNAL_CALLS: "yes" }, () => expect(() => serverEnv()).toThrow());
  });
  it("starts the real provider only with both a key and the approval", () => {
    withEnv({ LLM_PROVIDER: "anthropic", ANTHROPIC_API_KEY: KEY, LLM_EXTERNAL_CALLS: "approved" }, () => expect(serverEnv().LLM_PROVIDER).toBe("anthropic"));
  });
});
