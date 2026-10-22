/**
 * Outbound requests to identity providers whose addresses a tenant administrator typed in. The server must not be talked into reaching
 * internal services (cloud metadata, private networks): https only, no credentials in the URL, every resolved address must be public,
 * no redirects, a response size cap and a timeout. Loopback http is allowed only outside production, for the local fake provider.
 * DNS rebinding is closed: the address the connection uses is validated at connect time by the connection's own lookup, so the name cannot resolve to
 * something different between a check and the request. Production should still restrict egress at the network level as defense in depth (B-153).
 */
import { lookup } from "node:dns/promises";
import { isIP } from "node:net";
import { Agent, fetch as undiciFetch } from "undici";

export class UnsafeUrl extends Error {}

const V4_BLOCKED = [/^0\./, /^10\./, /^100\.(6[4-9]|[7-9]\d|1[01]\d|12[0-7])\./, /^127\./, /^169\.254\./, /^172\.(1[6-9]|2\d|3[01])\./, /^192\.0\.0\./, /^192\.0\.2\./, /^192\.168\./, /^198\.(1[89])\./, /^198\.51\.100\./, /^203\.0\.113\./, /^(22[4-9]|2[3-5]\d)\./];
export function isNonPublicAddress(ip: string): boolean {
  const lower = ip.toLowerCase();
  const mapped = /^::ffff:(\d+\.\d+\.\d+\.\d+)$/.exec(lower);
  if (mapped) return isNonPublicAddress(mapped[1]!);
  if (isIP(lower) === 4) return V4_BLOCKED.some((r) => r.test(lower));
  if (isIP(lower) === 6) return lower === "::" || lower === "::1" || /^(fc|fd|fe[89ab]|ff)/.test(lower) || lower.startsWith("2001:db8");
  return true; // not an address at all
}
const isLoopbackHost = (h: string) => h === "localhost" || h === "::1" || /^127\./.test(h);

export async function assertPublicHttps(raw: string, resolve: (host: string) => Promise<string[]> = async (h) => (await lookup(h, { all: true })).map((a) => a.address)): Promise<URL> {
  let u: URL;
  try { u = new URL(raw); } catch { throw new UnsafeUrl("not a valid URL"); }
  if (u.username || u.password) throw new UnsafeUrl("credentials in a URL are not allowed");
  const host = u.hostname.replace(/^\[|\]$/g, "").toLowerCase();
  if (u.protocol === "http:" && isLoopbackHost(host) && process.env["NODE_ENV"] !== "production") return u;
  if (u.protocol !== "https:") throw new UnsafeUrl("must be https");
  if (u.port && !["443", ""].includes(u.port)) throw new UnsafeUrl("only the default https port is allowed");
  const addrs = isIP(host) ? [host] : await resolve(host).catch(() => { throw new UnsafeUrl("host does not resolve"); });
  if (addrs.length === 0 || addrs.some(isNonPublicAddress)) throw new UnsafeUrl("host resolves to a non-public address");
  return u;
}

type Resolver = (host: string) => Promise<string[]>;
const defaultResolve: Resolver = async (h) => (await lookup(h, { all: true })).map((a) => a.address);

type LookupCallback = (err: Error | null, address?: string | { address: string; family: number }[], family?: number) => void;
/**
 * The lookup the HTTP connection itself uses. It refuses a name that resolves to anything non-public, and hands back exactly the addresses it validated,
 * so the connection can only go where the check said it could (no second resolution, no rebinding window).
 */
export function guardedLookup(resolve: Resolver = defaultResolve) {
  return (hostname: string, options: { all?: boolean | undefined } | undefined, cb: LookupCallback): void => {
    resolve(hostname).then((addrs) => {
      if (addrs.length === 0 || addrs.some(isNonPublicAddress)) return cb(new UnsafeUrl("host resolves to a non-public address"));
      if (options?.all) return cb(null, addrs.map((a) => ({ address: a, family: isIP(a) })));
      cb(null, addrs[0]!, isIP(addrs[0]!));
    }, (e: Error) => cb(e));
  };
}
let sharedAgent: Agent | undefined;
const agentFor = (resolve?: Resolver): Agent => resolve ? new Agent({ connect: { lookup: guardedLookup(resolve) as never } }) : (sharedAgent ??= new Agent({ connect: { lookup: guardedLookup() as never } }));

/**
 * A fetch that can only reach public https hosts: the URL is checked, then the connection is pinned to validated addresses. Loopback http is permitted
 * outside production (local fake providers) and goes through the plain client.
 */
export async function guardedFetch(raw: string, init: RequestInit = {}, o: { resolve?: Resolver } = {}): Promise<Response> {
  const u = await assertPublicHttps(raw, o.resolve);
  if (u.protocol === "http:") return fetch(u, { ...init, redirect: "error" });
  const agent = agentFor(o.resolve);
  try {
    return (await undiciFetch(u, { ...(init as object), redirect: "error", dispatcher: agent } as never)) as unknown as Response;
  } finally {
    if (o.resolve) void agent.close(); // per-call agents exist only when a test injects a resolver
  }
}

export interface Fetched { status: number; ok: boolean; text: string; json(): unknown }
export async function fetchPublic(raw: string, init: RequestInit = {}, o: { maxBytes?: number; timeoutMs?: number; resolve?: (h: string) => Promise<string[]> } = {}): Promise<Fetched> {
  const res = await guardedFetch(raw, { ...init, signal: AbortSignal.timeout(o.timeoutMs ?? 5000) }, o.resolve ? { resolve: o.resolve } : {});
  const max = o.maxBytes ?? 262_144;
  const reader = res.body?.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  while (reader) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > max) { await reader.cancel(); throw new UnsafeUrl("response too large"); }
    chunks.push(value);
  }
  const text = Buffer.concat(chunks).toString("utf8");
  return { status: res.status, ok: res.ok, text, json: () => JSON.parse(text) };
}
