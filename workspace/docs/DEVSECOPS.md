# DevSecOps blueprint (B-204)

Labels: [V] verified, [S] secondary, [I] inferred, [A] assumed. Sized for one builder; every control below must be enforceable by tooling, not by memory.

## Pipeline
1. **Local:** fast pre-push check (typecheck, tests, secret scan) so bad commits rarely reach CI. `scripts/verify.sh` is the single completion check.
2. **Pull request (required checks):** lint, typecheck, unit and integration tests, evaluation-set regression, diagram parse check, secret scan, dependency audit, SAST, SBOM generation, IaC policy checks. Merge only on green. Branch protection: no direct push to main, required status checks. A solo builder cannot satisfy two-person review, so each change touching rules, prompts, tenancy, auth or the gateway gets a recorded self-review checklist plus a fresh-evaluator review (cross-review skill), which finds defects but is not independent approval (stated plainly in lender answers).
3. **Preview:** every PR gets a preview deployment with its own database branch or schema and synthetic data only; torn down on close. Never against production data.
4. **Release:** tag, build, attest, deploy to production only from main; post-deploy smoke test; record the deployed commit.
5. **Operate:** structured logs without PII, alerts, backups with restore tests, dependency alerts.

## Controls and tooling options (choose by verifying current terms; none selected yet, B-120)
| Area | Control | Options to evaluate |
|---|---|---|
| Secrets | Scan every push and history; never commit .env; short-lived credentials via OIDC to clouds where supported | gitleaks (open source) [I]; platform secret store; GitHub push protection (verify plan) |
| Dependencies | Lockfile, `npm audit`, update bot, review of new packages, pin versions | Dependabot or Renovate [I] |
| SAST | Static analysis on TypeScript | CodeQL (private-repo licensing to verify), Semgrep OSS [I] |
| SBOM | Generate and store per release | Syft or cyclonedx-npm producing CycloneDX or SPDX [S] |
| Build provenance and signing | Signed attestation of how and where an artifact was built | GitHub artifact attestations / Sigstore [S]. SLSA Build L2 means provenance generated and signed on a hosted build platform; L3 adds isolated builds and protected signing secrets [V, S-30]. Limit: Vercel's Git-integrated deploys build on Vercel, so attestation of our own CI build does not cover the deployed bundle unless we deploy a prebuilt output from CI; decide in B-120 |
| IaC | Environments defined in code, reviewed, plan output in PR | Terraform or OpenTofu where a provider exists for the chosen vendors (verify per vendor) |
| Policy as code | Rules that fail CI | Conftest/OPA for IaC [I]; plus our own SQL and TypeScript tests: forced RLS on every table, no BYPASSRLS role, append-only triggers present, no table without a tenant column unless allowlisted |
| Container/runtime | Not applicable while on Vercel Functions; revisit if we add workers | |
| Access | Least privilege per component, separate migration and application database roles, MFA everywhere, no shared accounts | |
| Logging | No raw documents or identifiers in logs; audit ledger separate from app logs | |
| Backups and recovery | Point-in-time recovery, restore drill each quarter | Vendor-dependent (B-118) |
| Pen test | External test before any real borrower data | Budget to be priced |

## Framework alignment
NIST SSDF (SP 800-218 v1.1, Feb 2022) is a set of high-level secure development practices to integrate into a lifecycle, not a certification [V, S-31]. We map our controls to it in the compliance roadmap rather than claiming conformance.

## What is enforced today
`scripts/verify.sh` and a GitHub Actions workflow running it. Everything else above is planned. Also enforced as of loop 12: a pattern-based secret scan in `verify`, `npm audit --omit=dev` (high) and a CycloneDX SBOM artifact in CI, security headers, rate limiting and a route policy test (see THREAT_MODEL.md). Not configured: SAST, a full secret scanner (gitleaks), signing or provenance, IaC policy checks.
