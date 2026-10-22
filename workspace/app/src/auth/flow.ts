/** The short-lived, encrypted cookie that carries state, nonce and PKCE verifier across the redirect to the identity provider. */
import { createCipheriv, createDecipheriv, hkdfSync, randomBytes } from "node:crypto";

export interface FlowState { state: string; nonce: string; verifier: string; returnTo: string; exp: number }
const AAD = Buffer.from("uw-oidc-flow-v1");
const key = (master: Buffer) => Buffer.from(hkdfSync("sha256", master, Buffer.from("uw-auth"), Buffer.from("oidc-flow-key"), 32));

export function sealFlow(master: Buffer, f: FlowState): string {
  const iv = randomBytes(12);
  const c = createCipheriv("aes-256-gcm", key(master), iv);
  c.setAAD(AAD);
  const ct = Buffer.concat([c.update(JSON.stringify(f), "utf8"), c.final()]);
  return Buffer.concat([iv, c.getAuthTag(), ct]).toString("base64url");
}

export function openFlow(master: Buffer, sealed: string, now = Date.now()): FlowState | null {
  try {
    const b = Buffer.from(sealed, "base64url");
    if (b.length < 29) return null;
    const d = createDecipheriv("aes-256-gcm", key(master), b.subarray(0, 12));
    d.setAAD(AAD);
    d.setAuthTag(b.subarray(12, 28));
    const f = JSON.parse(Buffer.concat([d.update(b.subarray(28)), d.final()]).toString("utf8")) as FlowState;
    if (typeof f.exp !== "number" || f.exp < now) return null;
    return f;
  } catch {
    return null;
  }
}

/** Only same-site relative paths are accepted as post-login destinations (no open redirect). */
export function safeReturnTo(raw: string | null | undefined): string {
  if (!raw || raw.length > 300) return "/review";
  if (!raw.startsWith("/") || raw.startsWith("//") || raw.includes("\\") || /[\u0000-\u001f]/.test(raw)) return "/review";
  return raw;
}
