import { ver } from "../review/live";
import type { SecurityEvent, SessionRow, UserRow } from "./queries";

/**
 * Version tokens for the screens that update themselves (D-039): the browser polls a small read-only route and refreshes the page only when the token
 * changes. Each token is a hash of ids, states and counts, so it changes exactly when something the screen shows has changed, and it carries no
 * email address or other content. The page and its route both call these with rows from the same query, so they always agree.
 */
export interface AdminLive { version: string; active: boolean }

/** Role, status, linked identity and session count per user. Last-seen times are left out: they change on every request and would refresh the page constantly. */
export const usersVersion = (rows: UserRow[]): string => ver(rows.map((u) => [u.id, u.role, u.disabled, u.issuer, u.subject, u.sessions]));

/** The newest security event: the ledger only grows, so its sequence number changes whenever a new event is recorded. Rows are newest first. */
export const eventsVersion = (rows: SecurityEvent[]): string => ver(rows[0]?.seq ?? null);

/** Which sessions exist and which one is the caller's. Last-active times are left out, for the same reason as above. */
export const sessionsVersion = (rows: SessionRow[]): string => ver(rows.map((r) => [r.id, r.is_current]));

/** Nothing here is ever "in progress": the pages poll at the slow rate. */
export const live = (version: string): AdminLive => ({ version, active: false });
