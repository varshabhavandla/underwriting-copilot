import { withTenant, type Sql, type TenantContext } from "../db/client";
import { appendAudit } from "../db/repo";
import type { BoardingPackage, ServicingAdapter } from "./adapter";
import { postWebhook, type WebhookTarget } from "./webhook";

export const MAX_ATTEMPTS = 6;
export const LEASE_SECONDS = 60;
/** 30s, 60s, 120s ... capped at one hour. */
export const backoffSeconds = (attempts: number): number => Math.min(3600, 30 * 2 ** Math.max(0, attempts - 1));

export interface DeliverOptions {
  adapter: ServicingAdapter;
  webhook?: WebhookTarget | undefined;
  now?: Date;
  limit?: number;
  timeoutMs?: number;
}

export interface DeliverSummary { claimed: number; delivered: number; retried: number; failed: number }

interface Claimed { id: string; case_id: string; event_type: string; payload: Record<string, unknown>; idempotency_key: string; attempts: number; created_at: string }

/**
 * Claims due events with a lease (safe with several workers), delivers each, and records the result. Delivery is at least once; consumers
 * must be idempotent on the event id / idempotency key. Approved cases are boarded in the servicing system and then marked handed_off.
 */
export async function deliverOutbox(sql: Sql, ctx: TenantContext, opt: DeliverOptions): Promise<DeliverSummary> {
  const now = opt.now ?? new Date();
  const claimed = await withTenant(sql, ctx, (tx) => tx<Claimed[]>`
    update outbox_events set locked_until = ${new Date(now.getTime() + LEASE_SECONDS * 1000)}, attempts = attempts + 1
    where id in (select id from outbox_events where status = 'pending' and next_attempt_at <= ${now} and (locked_until is null or locked_until < ${now})
                 order by created_at limit ${opt.limit ?? 10} for update skip locked)
    returning id, case_id, event_type, payload, idempotency_key, attempts, created_at::text`);
  const out: DeliverSummary = { claimed: claimed.length, delivered: 0, retried: 0, failed: 0 };

  for (const ev of claimed) {
    const ac = new AbortController();
    const timer = setTimeout(() => ac.abort(), opt.timeoutMs ?? 10_000);
    let ok = true, retryable = false, error = "", externalId: string | null = null;
    try {
      if (ev.event_type === "case.approved") {
        const pkg = await withTenant(sql, ctx, async (tx): Promise<BoardingPackage | null> => {
          const [a] = await tx<{ legal_name: string; ein_last4: string; loan_amount_cents: string; requested_term_months: number | null; purposes: string[] }[]>`
            select legal_name, ein_last4, loan_amount_cents::text, requested_term_months, purposes from applications where case_id = ${ev.case_id}`;
          return a ? { idempotencyKey: ev.idempotency_key, caseId: ev.case_id, decisionId: String(ev.payload["decisionId"]), policyVersion: String(ev.payload["policyVersion"]), decidedAt: String(ev.payload["decidedAt"]),
            borrower: { legalName: a.legal_name, einLast4: a.ein_last4 }, loan: { amountCents: a.loan_amount_cents, termMonths: a.requested_term_months, purposes: a.purposes } } : null;
        });
        if (!pkg) { ok = false; retryable = false; error = "no application found to board"; }
        else {
          const r = await opt.adapter.board(pkg, ac.signal).catch((e: Error) => ({ accepted: false as const, retryable: true, error: e.message }));
          if (r.accepted) externalId = r.externalId; else { ok = false; retryable = r.retryable; error = r.error; }
        }
      }
      if (ok && opt.webhook) {
        const r = await postWebhook(opt.webhook, { id: ev.id, type: ev.event_type, createdAt: ev.created_at, data: ev.payload }, ac.signal);
        if (!r.ok) { ok = false; retryable = r.retryable; error = r.error ?? "webhook failed"; }
      }
    } catch (e) {
      ok = false; retryable = false; error = (e as Error).message;
    } finally {
      clearTimeout(timer);
    }

    await withTenant(sql, ctx, async (tx) => {
      if (ok) {
        await tx`update outbox_events set status = 'delivered', delivered_at = ${now}, external_id = ${externalId}, locked_until = null, last_error = null where id = ${ev.id}`;
        await appendAudit(tx, ctx.tenantId, { actorKind: "system", actorId: opt.adapter.name, action: "servicing.event_emitted", subject: { caseId: ev.case_id, eventId: ev.id, type: ev.event_type, externalId } });
        if (ev.event_type === "case.approved") await tx`update cases set status = 'handed_off' where id = ${ev.case_id} and status = 'approved'`;
        out.delivered++;
      } else if (retryable && ev.attempts < MAX_ATTEMPTS) {
        await tx`update outbox_events set next_attempt_at = ${new Date(now.getTime() + backoffSeconds(ev.attempts) * 1000)}, locked_until = null, last_error = ${error} where id = ${ev.id}`;
        out.retried++;
      } else {
        await tx`update outbox_events set status = 'failed', locked_until = null, last_error = ${error} where id = ${ev.id}`;
        await tx`insert into exceptions (tenant_id, case_id, kind, severity, detail) values (${ctx.tenantId}, ${ev.case_id}, 'delivery_failed', 'high', ${`event ${ev.event_type} could not be delivered after ${ev.attempts} attempt(s): ${error}`})`;
        await appendAudit(tx, ctx.tenantId, { actorKind: "system", actorId: opt.adapter.name, action: "servicing.event_emitted", subject: { caseId: ev.case_id, eventId: ev.id, type: ev.event_type }, result: "error" });
        out.failed++;
      }
    });
  }
  return out;
}
