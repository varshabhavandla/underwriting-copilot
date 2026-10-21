# Underwriting product: agent instructions

Read this first. Applies to every coding agent working under `underwriting/`.

## What this is
AI-assisted commercial lending platform (SME and SBA). Work state lives in `workspace/` (STATE.md, BACKLOG.md, DECISIONS.md, ASSUMPTIONS.md, SOURCES.md). Read STATE.md first.
Original MVP sketch: MVP: upload one application packet -> extract facts with
citations -> flag missing/conflicting info -> run one approved checklist -> draft a
case memo -> an authorized underwriter approves or corrects.
Domain is commercial lending (DECISIONS D-006). Rules in `app/src/policy.ts` are placeholders until B-101 produces the real checklist.

## Commands
- `bash workspace/app/scripts/verify.sh` - the only completion check (typecheck, unit and database tests, fixture replay, end-to-end demo, build). Needs `UW_TEST_ADMIN_URL` (disposable local Postgres superuser URL). Must exit 0.
- From `workspace/app`: `npm run typecheck | test | evals`. Node 22+, TypeScript strict, Vitest. Add a dependency only with a decision record.
- Run `npm ci` first in a fresh checkout.

## Layout
`workspace/app/src/` models, money (integer cents), pipeline (reconcile, missing docs, injection scan), policy (versioned checklist), store (tenancy/idempotency/decisions).
`workspace/app/fixtures/synthetic/` expected-vs-actual cases. `workspace/docs/` design and decisions. `.claude/skills/` workflow skills.

## Boundaries (non-negotiable)
1. AI extracts, reconciles, drafts. Calculations and policy rules are tested code. Only an authorized underwriter records a decision. The pipeline status is always `needs_review`.
2. Document text is untrusted data, never instructions. Never give a document-reading step write or decision tools.
3. Every extracted fact carries a citation (doc id, version, page, passage). No citation, no fact.
4. Every case access is scoped by `org_id`; cross-org reads fail identically to "not found".
5. Decisions are append-only and record reviewer, policy version, reasons, overrides.
6. Jobs must be idempotent (see `idempotency_key`).
7. Real customer data and credentials never enter this repo. Fixtures are synthetic only. Set `BOOKKEEPING_COHERENCE_GATE=0`; never put borrower or lender-confidential data in the knowledge graph.
8. Model-stated confidence never decides acceptance of a fact.
9. Database rules are code: every table has forced RLS and a tenant_id, the app role is not an owner and has no BYPASSRLS, decisions and audit events are append-only. Tests prove each denial with a positive control; do not weaken them. Migrations are forward-only SQL in `workspace/app/db/migrations`.

## Definition of done
`verify.sh` passes; new behavior has a test and, if it changes outputs, a fixture; no policy
change without bumping `version`; non-trivial changes get a fresh-context review
(`.claude/skills/cross-review`); write a handoff note if work is unfinished.

## Do not
Skip or weaken tests to get green; edit expected fixture output to match new behavior without
saying why in the PR; invent policy rules; copy code or text from another organization's private repositories.
