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
