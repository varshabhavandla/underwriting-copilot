# Access and integrity model

- Tenant isolation: every table has `tenant_id` with forced row-level security; the app role is not an owner and has no BYPASSRLS; foreign and missing cases return the same not-found (test/db/rls.test.ts).
- Roles: `viewer` reads; `underwriter` records decisions. Add roles only with a decision record.
- Decisions append-only; corrections are new entries, not edits.
- Idempotency: key = hash(org, case ref, sorted document hashes); retries return the existing case.
- Prompt-injection: the regex scan is a tripwire for humans, not a defense. The real defense is
  architectural: the extraction step has no tools that change state or record decisions.
- Secrets: none in repo; a pattern scan runs in `verify` (a full scanner is B-134); production refuses development credentials and unencrypted database URLs.
- Before sensitive data: run the agent-security and web-security review skills and record findings.

## Implemented in the database (loops 6-9)
- Forced RLS and tenant_id on every table; app role is not an owner and has no BYPASSRLS; tests prove each denial with a positive control.
- Append-only: decisions, audit events, rule runs and results, memos, memo adoptions. Exceptions can change only their disposition.
- Decision gate: a decision requires the session user to be an underwriter of the tenant and to be the decider; approving with open critical or high exceptions requires a recorded override; a decided case is final; approved and declined are reachable only through a matching recorded decision.
- Exception disposition and memo adoption require an underwriter acting as themselves; both are audited by trigger.
- Audit events are hash-chained per tenant; the chain verifies.
Not implemented: authentication (dev tenant stub), roles beyond viewer/processor/underwriter/admin, per-tenant keys in a key service, rate limiting.
