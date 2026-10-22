# STATE

## Open questions for the builder
1. Domain scope for the MVP: Standard 7(a) and 7(a) Small only (my assumption, A-in process map), or include 504 and SBA Express?
2. Is Vercel's Pro plan acceptable once anything leaves local dev (Hobby is non-commercial only)?

Answered 2026-10-21: TypeScript on Vercel (D-008); use broomva/skills, nothing from other organizations' private repos (D-009).

## Open question for the builder (answer when convenient; defaults are in use)
Do you accept the default stack in DECISIONS.md D-002/D-003 (Python 3.12 + FastAPI + Postgres, AWS, Terraform written but never applied)? If you prefer another language/framework or cloud, say so and I will supersede the decision before Phase 3 step 1.

## Done
- Workspace scaffold: STATE, BACKLOG, DECISIONS, ASSUMPTIONS, SOURCES, docs/, diagrams/, app/.
- Existing foundation (stdlib Python: reconcile, versioned checklist, tenancy/idempotency store, synthetic fixtures, 12 tests + 6 fixture cases) moved to app/; verify still passes.
- Domain decided: commercial lending (SME and SBA). Supersedes the open item in docs/decisions/0002.

- Loop 7: application flow (validated, EIN encrypted per tenant), encrypted upload storage, content-type checks; LLM gateway with redaction, budgets, citation verification; validators; ingestion with evidence scores and exceptions; extraction eval; web end-to-end script (23 checks); 84 tests; mutation checks caught. Skills autonomous/persist read; PROMPT.md restart contract added.
- Loop 6: migrations and repo layer with forced RLS, decision gate and hash-chained ledger; 42 database tests on real Postgres 16 (4 mutation checks caught); Next.js shell; end-to-end demo; verify.sh now requires a test database.
- Loop 5: fair lending and model risk (SR 11-7 was superseded by SR 26-2 on 2026-04-17), DevSecOps blueprint, compliance roadmap with questionnaire draft.
- Loop 4: measurement plan, reference architecture with 6 diagrams, agentic layer (OWASP LLM Top 10 2025 mapping, approval gates, audit event schema). Open decisions D-011, D-013..D-016.
- Loop 3: SBA appendices 14/15/16/17/19, SBA eligibility change (Aug 2023), conventional SME outline, competitive scan and provisional wedge D-010 (nCino+Parlay now contest SBA intake).
- Loop 2.5: ported core to TypeScript (14 tests, 6 fixture cases pass); installed broomva/skills (MIT) under .agents/skills with attribution.
- Loop 2: SBA process map from SOP 50 10 8.1 primary text (docs/SBA_PROCESS_MAP.md); sources S-1..S-6.

## Next (loop 8)
Phase 3 step 5: rules engine plus agent that builds the file: completeness and consistency against the SOP rule pack, exception list, and a credit memo draft where every statement cites an accepted fact or a computed value (mock provider; real provider needs approval, B-124). Then step 6 underwriter console with explicit approve/decline/request-more-info. Builder inputs still pending: B-116 lender conversations, B-117 auth provider, connect Vercel connector, approval for a real model provider.

## Blockers
None. No paid resources, no outside contact, no real data.

## Hard constraints (re-checked each loop)
Human underwriter makes every final credit decision. Synthetic data only. Nothing outside ./workspace/ and this repo. No unverified claims.
