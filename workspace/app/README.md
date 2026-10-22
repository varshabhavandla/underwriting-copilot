# App (core library, data layer, web shell)

Local, no cloud accounts needed.

1. Start Postgres 16 (`docker compose up -d`, or any local Postgres) and set `UW_TEST_ADMIN_URL` to a superuser URL of a disposable instance.
2. `npm ci`
3. `bash scripts/verify.sh` runs typecheck, unit and database tests (84), fixture replay, the extraction evaluation, the end-to-end demo, a production build and a 23-check web end-to-end run (`scripts/e2e-web.sh`; needs psql, curl, openssl).
4. `npm run demo` builds a fresh `uw_demo` database and walks six synthetic packets to a recorded human decision.
5. To view it: `DATABASE_URL=postgres://uw_app:uw_app_dev@127.0.0.1:54329/uw_demo DEV_TENANT_ID=<tenant id> npm run dev`.

Roles: `uw_owner` owns tables and runs migrations; `uw_app` is what the app uses (not superuser, no BYPASSRLS, owns nothing). Passwords here are local-only.

Web API (development; tenant comes from `DEV_TENANT_ID`, real sign-in is not built): `POST /api/applications` (JSON), `POST /api/applications/<caseId>/documents` (multipart `file`, `docType` of tax_return, bank_statement or financial_statement), `/apply` form. Extra env: `FIELD_KEY_MASTER` (base64, 32+ bytes, local key derivation only), `UPLOAD_DIR`.
Extraction evaluation: `npm run eval:extraction` (scores the pipeline with a mock provider; not model quality).
