# App (core library, data layer, web shell)

Local, no cloud accounts needed.

1. Start Postgres 16 (`docker compose up -d`, or any local Postgres) and set `UW_TEST_ADMIN_URL` to a superuser URL of a disposable instance.
2. `npm ci`
3. `bash scripts/verify.sh` runs typecheck, unit and database tests, fixture replay, the end-to-end demo and a production build.
4. `npm run demo` builds a fresh `uw_demo` database and walks six synthetic packets to a recorded human decision.
5. To view it: `DATABASE_URL=postgres://uw_app:uw_app_dev@127.0.0.1:54329/uw_demo DEV_TENANT_ID=<tenant id> npm run dev`.

Roles: `uw_owner` owns tables and runs migrations; `uw_app` is what the app uses (not superuser, no BYPASSRLS, owns nothing). Passwords here are local-only.
