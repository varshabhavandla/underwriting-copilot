# PROMPT.md - restart contract (persist discipline)

Goal: ship the MVP per the phases in STATE.md on synthetic data only, with a human making every credit decision.
Resume protocol for a fresh context: read STATE.md, BACKLOG.md, DECISIONS.md; run `git log --oneline | head`; run the verify command below; continue the first unblocked item under STATE.md "Next".
State lives in files and git, not in conversation. Never rely on memory of a prior session.

Verify (the only completion check):
  pg: start a disposable local Postgres 16 (see workspace/app/README.md), export UW_TEST_ADMIN_URL, then
  bash workspace/app/scripts/verify.sh   -> must print "verify: OK"

Success condition for the current loop (loop 11): STATE.md says "loop 11 complete" AND verify passes AND step 8 (evaluation harness and measured comparison) is implemented with tests.
Budget: stop and write STATE.md with the open question when blocked on something only the builder can supply (auth provider, lender conversations, Vercel connection, paid resources).

Hard constraints: human underwriter decides; synthetic data only; no paid resources, no outside contact, nothing outside this repo without asking; no unverified claims; no real borrower data; secrets never committed.
Backpressure is external: compilers, tests, mutation checks and the end-to-end demo decide done, not self-assessment.
