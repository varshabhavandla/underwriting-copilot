/** Session tokens and cookies. The token is random, only its SHA-256 is stored, and the database enforces expiry, inactivity and revocation. */
import { createHash, randomBytes } from "node:crypto";
import type { Sql } from "../db/client";

export const SESSION_COOKIE = "__Host-uw_session";
export const FLOW_COOKIE = "__Host-uw_oidc";
export type Role = "viewer" | "processor" | "underwriter" | "admin";
export interface SessionIdentity { sessionId: string; tenantId: string; userId: string; role: Role }

export function newSessionToken(): { token: string; hash: Buffer } {
  const token = randomBytes(32).toString("base64url");
  return { token, hash: hashToken(token) };
}
export const hashToken = (token: string): Buffer => createHash("sha256").update(token).digest();
const TOKEN_RE = /^[A-Za-z0-9_-]{43}$/;

export function cookieValue(header: string | null | undefined, name: string): string | null {
  if (!header) return null;
  for (const part of header.split(";")) {
    const i = part.indexOf("=");
    if (i > 0 && part.slice(0, i).trim() === name) return part.slice(i + 1).trim();
  }
  return null;
}

/** __Host- cookies require Secure, Path=/ and no Domain, which also stops sibling subdomains from setting them. */
export function setCookie(name: string, value: string, maxAgeSeconds: number): string {
  return `${name}=${value}; Path=/; Max-Age=${maxAgeSeconds}; HttpOnly; Secure; SameSite=Lax`;
}
export const clearCookie = (name: string) => `${name}=; Path=/; Max-Age=0; HttpOnly; Secure; SameSite=Lax`;

export async function loginIdentity(sql: Sql, issuer: string, subject: string, tokenHash: Buffer, absoluteSeconds: number): Promise<SessionIdentity | null> {
  const rows = await sql<{ session_id: string; tenant_id: string; user_id: string; role: Role }[]>`
    select * from auth.login(${issuer}, ${subject}, ${tokenHash}, make_interval(secs => ${absoluteSeconds}))`;
  const r = rows[0];
  return r ? { sessionId: r.session_id, tenantId: r.tenant_id, userId: r.user_id, role: r.role } : null;
}

export async function resolveSession(sql: Sql, token: string | null, idleSeconds: number): Promise<SessionIdentity | null> {
  if (!token || !TOKEN_RE.test(token)) return null;
  const rows = await sql<{ session_id: string; tenant_id: string; user_id: string; role: Role }[]>`
    select * from auth.resolve_session(${hashToken(token)}, make_interval(secs => ${idleSeconds}))`;
  const r = rows[0];
  return r ? { sessionId: r.session_id, tenantId: r.tenant_id, userId: r.user_id, role: r.role } : null;
}

export async function endSession(sql: Sql, token: string | null): Promise<void> {
  if (!token || !TOKEN_RE.test(token)) return;
  await sql`select auth.logout(${hashToken(token)})`;
}
