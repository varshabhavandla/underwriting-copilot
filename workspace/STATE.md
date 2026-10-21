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

- Loop 3: SBA appendices 14/15/16/17/19, SBA eligibility change (Aug 2023), conventional SME outline, competitive scan and provisional wedge D-010 (nCino+Parlay now contest SBA intake).
- Loop 2.5: ported core to TypeScript (14 tests, 6 fixture cases pass); installed broomva/skills (MIT) under .agents/skills with attribution.
- Loop 2: SBA process map from SOP 50 10 8.1 primary text (docs/SBA_PROCESS_MAP.md); sources S-1..S-6.

## Next (loop 4)
B-103 time-to-decision measurement plan; then Phase 2 (B-201 reference architecture, B-202 agentic layer). B-116 lender-validation questions need the builder.

## Blockers
None. No paid resources, no outside contact, no real data.

## Hard constraints (re-checked each loop)
Human underwriter makes every final credit decision. Synthetic data only. Nothing outside ./workspace/ and this repo. No unverified claims.
