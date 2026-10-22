# Access and integrity model

- Org isolation: every query takes `org_id`; foreign and missing cases return the same error.
  In a real database enforce with row-level security, not only application code.
- Roles: `viewer` reads; `underwriter` records decisions. Add roles only with a decision record.
- Decisions append-only; corrections are new entries, not edits.
- Idempotency: key = hash(org, case ref, sorted document hashes); retries return the existing case.
- Prompt-injection: the regex scan is a tripwire for humans, not a defense. The real defense is
  architectural: the extraction step has no tools that change state or record decisions.
- Secrets: none in repo; CI secret scanning to be added before any real integration.
- Before sensitive data: run the agent-security and web-security review skills and record findings.

## Implemented in the database (loops 6-9)
- Forced RLS and tenant_id on every table; app role is not an owner and has no BYPASSRLS; tests prove each denial with a positive control.
- Append-only: decisions, audit events, rule runs and results, memos, memo adoptions. Exceptions can change only their disposition.
- Decision gate: a decision requires the session user to be an underwriter of the tenant and to be the decider; approving with open critical or high exceptions requires a recorded override; a decided case is final; approved and declined are reachable only through a matching recorded decision.
- Exception disposition and memo adoption require an underwriter acting as themselves; both are audited by trigger.
- Audit events are hash-chained per tenant; the chain verifies.
Not implemented: authentication (dev tenant stub), roles beyond viewer/processor/underwriter/admin, per-tenant keys in a key service, rate limiting.
