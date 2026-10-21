# DECISIONS
Never edit silently; supersede with a new entry.

## D-001 Human makes every final credit decision (hard constraint)
Status: accepted (given by builder). The system may prepare, validate, flag, and advance workflow only. Decision recording requires an authenticated underwriter role. Pipeline status is never "approved".

## D-002 Language/framework (default; builder not yet asked-and-answered)
Options: Python+FastAPI; TypeScript+Node; Go. Choice: Python 3.12 + FastAPI. Rationale: existing foundation is Python; strongest document/ML/eval ecosystem; boring and widely adopted. Status: default, awaiting confirmation.

## D-003 Cloud and data store (default)
Options: AWS; GCP; Azure. Choice: AWS + Postgres (RDS) with row-level security. Rationale: widely adopted in bank-adjacent vendors; per-tenant KMS keys; matches DevSecOps background. Terraform skeleton only; nothing applied without approval. Local dev: Docker Compose. Status: default, awaiting confirmation. Cost report: $0 until anything is provisioned.

## D-004 Repo layout
Single repo `underwriting-copilot`; work under `workspace/`. Supersedes the earlier `underwriting/` subfolder layout. Existing foundation moved to `workspace/app/`.

## D-005 Wedge (provisional, pending B-102)
Hypothesis: SBA 7(a) file preparation and exception detection for small community lenders. Not final until the competitive scan.

## D-006 Domain
Commercial lending (SME and SBA). Supersedes docs/decisions/0002 (domain open).
