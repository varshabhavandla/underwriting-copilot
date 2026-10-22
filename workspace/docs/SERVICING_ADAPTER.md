# Servicing adapter and event delivery

Status: implemented with a mock servicing system (loop 10). A real lender integration replaces `MockServicingAdapter`; nothing else changes.

## What leaves the product, and when
Events exist only because a human decision exists. A database trigger queues one event per recorded decision in the same transaction (`case.approved`, `case.declined`, `case.info_requested`); a row-level security policy refuses any event without a matching decision, even from application code. Nothing in the pipeline (extraction, rules, memo) can create an event.

## Adapter interface (`workspace/app/src/servicing/adapter.ts`)
`board(package, signal) -> { accepted: true, externalId } | { accepted: false, retryable, error }`
- Called for `case.approved` only. The package carries ids, policy version, decision time, borrower legal name and EIN last four digits, and loan amount, term and purposes. The full EIN, free-text decision reasons and document contents are never sent.
- Idempotent by `idempotencyKey` (`decision:<id>`): a repeat must return the same `externalId` and must not create a second loan. Delivery is at least once.
- `retryable: true` for timeouts, 5xx and rate limits; `false` when the system refuses (needs a person).
- The adapter decides nothing and is never called before a decision.
A real adapter maps the package to the servicing system's boarding API, uses the idempotency key as its idempotency or external reference, and classifies errors into retryable and permanent.

## Delivery (`deliverOutbox`)
- Workers claim due events with a lease (`for update skip locked`, 60 seconds), so several workers are safe.
- Backoff 30 s, 60 s, 120 s ... capped at one hour; at most 6 attempts. A transient failure is retried; a permanent refusal or the last attempt marks the event failed and raises a high-severity `delivery_failed` exception on the case for a person.
- Success marks the event delivered, records the external id, writes a `servicing.event_emitted` audit event, and moves an approved case to `handed_off`.
- Event state is the only mutable part of an outbox row; delivered and failed are final; rows cannot be deleted.
- Trigger: `POST /api/outbox/deliver` with `Authorization: Bearer <WORKER_SECRET>` (disabled when the secret is unset). A scheduled job calls it in production.

## Webhooks
Optional signed POST to a subscriber URL (`WEBHOOK_URL`, `WEBHOOK_SECRET`). Body: `{ id, type, createdAt, data }`; `data` is the event payload (ids, decision, policy version; no free text).
Headers: `x-uw-event-id` (stable across retries; subscribers dedupe on it) and `x-uw-signature: t=<unix seconds>,v1=<hex>` where `v1 = HMAC_SHA256(secret, "<t>.<raw body>")`.
Verify on the raw body, compare in constant time, and reject timestamps more than 300 seconds from now:
```ts
import { createHmac, timingSafeEqual } from "node:crypto";
function verify(secret: string, rawBody: string, header: string, nowSeconds: number): boolean {
  const p = Object.fromEntries(header.split(",").map((x) => x.split("=") as [string, string]));
  const t = Number(p.t);
  if (!Number.isInteger(t) || Math.abs(nowSeconds - t) > 300 || !p.v1) return false;
  const exp = createHmac("sha256", secret).update(`${t}.${rawBody}`).digest();
  const got = Buffer.from(p.v1, "hex");
  return got.length === exp.length && timingSafeEqual(got, exp);
}
```
Responses: 2xx accepted; 408, 429 and 5xx are retried; other 4xx is a permanent refusal. Redirects are not followed.
Subscriber URL checks: https only (loopback only in local development), no credentials in the URL, no private, loopback, link-local or metadata addresses. DNS names that resolve to private addresses are not detected, so production delivery must also run from an egress path that cannot reach internal networks (B-130).

## Limits
Subscriptions are configured by environment variables for one tenant; per-tenant subscription tables, secret rotation, a dead-letter review screen, and replay are not built (B-130). The mock adapter is in memory and resets on restart.
