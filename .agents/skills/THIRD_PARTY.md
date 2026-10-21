# Third-party skills

Source: https://github.com/broomva/skills, commit 3876707d6c4e4cfb2bda405e4a1eece8e86f3313 (2026-10-21), MIT License,
Copyright (c) 2026 Carlos D. Escobar-Valbuena (broomva). Full license text: `LICENSE-broomva-skills.txt` (must stay with these files).

Copied (SKILL.md, scripts, references, templates; upstream `evals/`, `tests/`, `fixtures/` omitted):

| Skill | Upstream path | Why we use it |
|---|---|---|
| bstack | skills/governance/bstack | Primer for the 20 workflow primitives (P1-P20) |
| cross-review | skills/governance/cross-review | Fresh-evaluator adversarial review of substantial diffs (a defect-finder, not an independent approval) |
| autoreview | skills/governance/autoreview | Unattended multi-lens review of plans and specs (our Phase 1-2 documents) |
| dogfood | skills/governance/dogfood | Exercise the running change, record a receipt |
| legal-readiness | skills/governance/legal-readiness | Evidence-first audit of public and contractual claims (supports "never claim a certification we do not hold") |
| spec-contract | skills/governance/spec-contract | What a design doc must contain |
| kg, bookkeeping | skills/knowledge/* | Knowledge graph of decisions and gotchas (see safety notes) |
| p9, persist, handoff, autonomous | skills/orchestration/* | CI watching, restart loops, handoffs, bounded autonomy |
| decision-log, pre-mortem | skills/strategy/* | Decision records, failure-mode analysis |
| prove-the-negative | skills/tooling/prove-the-negative | Denial tests must pair with a positive control (tenant isolation tests) |

Local modifications: three code comments in `p9/scripts/p9.py` that named an unrelated organization's repository were
replaced with a neutral example. No behavior change.

Project-authored skills (not third party): `verify`, `business-intake`.

## Safety notes (read before running anything here)
- Nothing in this folder has been run beyond `--help`. Review a script before first use.
- `bookkeeping` can send a short excerpt of each knowledge entity to a third-party API (api.typesafe.ai) for a coherence check
  if a `TYPESAFE_API_KEY` exists. It is ON by default when a key is present. This project sets `BOOKKEEPING_COHERENCE_GATE=0`
  and holds no such key. Never put borrower data, credentials or lender-confidential material into the knowledge graph.
- `p9` can send notifications (for example to ntfy.sh) only if configured. Do not configure external notifiers without asking.
- `kg` and `bookkeeping` need `pip install PyYAML mistune`; `kg`/`bookkeeping` expect a `knowledge:` config block that this
  repo has not created yet (B-406).
- Upstream's own docs mention its author's paths and tooling; ignore those.
