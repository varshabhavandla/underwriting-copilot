import type { Tx } from "../db/client";

export interface UserRow { id: string; email: string; role: string; disabled: boolean; issuer: string | null; subject: string | null; sessions: number; last_seen: string | null }
export const listUsers = (tx: Tx) => tx<UserRow[]>`select id, email, role, disabled, issuer, subject, sessions, last_seen::text from auth.list_users()`;

export interface SessionRow { id: string; created_at: string; last_seen_at: string; expires_at: string; user_agent: string | null; is_current: boolean }
export const listMySessions = (tx: Tx, currentHash: Buffer) =>
  tx<SessionRow[]>`select id, created_at::text, last_seen_at::text, expires_at::text, user_agent, is_current from auth.list_my_sessions(${currentHash})`;

export interface SecurityEvent { seq: string; at: string; action: string; actor: string | null; subject: Record<string, unknown> }
/** Sign-in, sign-out, session and administration events from the tenant's audit ledger. Subjects hold ids and counts, never email addresses or tokens. */
export const listSecurityEvents = (tx: Tx, limit = 100) => tx<SecurityEvent[]>`
  select a.seq::text, a.at::text, a.action, u.email as actor, a.subject
  from audit_events a left join users u on u.id::text = a.actor_id
  where a.action like 'auth.%' or a.action like 'admin.%' order by a.seq desc limit ${limit}`;
