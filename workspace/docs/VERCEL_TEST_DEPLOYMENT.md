# Test deployment on Vercel (D-033)

Status 2026-10-22. This is for TESTING with synthetic data. It is not the pilot hosting decision (D-032, B-157): the pilot needs a malware scanner, managed key custody and fixed egress, which this setup lacks. Nothing in this document has been run against Vercel or Neon yet: the session had no Vercel access. Everything the repository can check on its own was run locally and is marked [T]; steps that touch your accounts are for you to run.

## What was prepared in the repository
- Documents can be kept as encrypted rows in the database (`OBJECT_STORE=postgres`), because Vercel functions have no writable disk. Tested: `test/db/pgstore.test.ts` and the whole end-to-end run with that store [T].
- A test deployment may run without a scanner only with `ALLOW_UNSCANNED_UPLOADS=test-environment-only`, and then every page shows a banner "TEST ENVIRONMENT. Synthetic data only. Uploads are not malware-scanned." Any other production start without `CLAMD_HOST` is refused [T].
- `DB_POOL_MAX=1` (one connection per function instance, so many instances cannot exhaust the database) [T].
- `scripts/check-database.ts` (`npm run db:check`) tests the two open questions from the hosting comparison on whatever database URL you give it: roles that cannot bypass row-level security, and transaction-local tenant settings through a pooler (300 concurrent transactions, none may see another's setting). It fails correctly when pointed at a superuser [T].
- `db/bootstrap/roles-hosted.sql` and `npm run db:migrate` create the two roles with strong passwords, the database, and apply all migrations; run on a fresh local cluster, the checks passed and a second migration run was a no-op [T].
- `scripts/smoke-remote.sh <url>` is a black-box check of a deployed instance (headers, redirects, refusals, no cookies for anonymous callers). It passes against a local server in per-organization mode and fails against a dead address [T].
- `vercel.json` (framework, install and build commands).

## What Vercel itself requires (read from its docs, S-35, S-38)
Pro plan or above for anything beyond personal, non-commercial use (the Hobby plan is non-commercial only); function bodies up to 4.5 MB (our upload cap is 4 MB); 300-second default duration; Vercel overwrites `X-Forwarded-For` with the client's address, so `TRUSTED_PROXY_HOPS=1`.

## Steps for you (about an hour; nothing here costs money on free tiers except Vercel Pro)
1. **Database.** Create a Neon project (free plan is enough for a test; S-39), in the region matching the Vercel function region (Vercel's default is `iad1`, Washington D.C.; Neon offers an AWS US East region [U, confirm in the console]). Copy two connection strings for the default database: direct and pooled.
2. **Roles and schema.** From your laptop:
   ```
   psql "$NEON_ADMIN_DIRECT_URL" -v owner_pw="$(openssl rand -hex 24)" -v app_pw="$(openssl rand -hex 24)" -v dbname=uw -f workspace/app/db/bootstrap/roles-hosted.sql
   ```
   Save both passwords. Build the URLs for the new database `uw` with each role (add `?sslmode=require`).
   ```
   cd workspace/app && OWNER_DATABASE_URL="<owner direct url>" npm run db:migrate
   APP_DATABASE_URL="<app pooled url>" OWNER_DATABASE_URL="<owner direct url>" npm run db:check
   APP_DATABASE_URL="<app direct url>" npm run db:check
   ```
   **If any check fails, stop and tell me**: a failing "cannot bypass row-level security" or "tenant setting never visible after commit" means that route is not safe for this application, and the hosting comparison changes (docs/HOSTING_OPTIONS.md findings 1 and 2). If Neon refuses a statement in `roles-hosted.sql`, send me the message; the script may need a provider-specific change.
3. **Identity provider.** Sign-in is required (the development identity is refused in production). Use any OpenID Connect provider that supports the authorization code flow with PKCE and RS256, PS256 or ES256 ID tokens (a free developer tenant at a provider you already use is fine; no provider has been evaluated, B-117). Register the callback `https://<your-app-domain>/api/auth/callback`. Note the issuer URL, client id and client secret.
4. **First organization.** From your laptop:
   ```
   OWNER_DATABASE_URL="<owner direct url>" FIELD_KEY_MASTER="<the same value you set on Vercel>" npx tsx scripts/provision-tenant.ts \
     --name "Test Bank" --slug test-bank --admin-email you@example.com \
     --issuer "<issuer url>" --client-id "<id>" --client-secret "<secret>" --admin-sub "<your subject id at the provider>"
   ```
   Your subject id is the `sub` the provider gives your user (most dashboards show it).
5. **Vercel project.** Import the repository; set **Root Directory** to `workspace/app`; Node 22. Add these environment variables for Production (and Preview if you want previews to work; each preview URL needs its own callback registered, so start with Production only):
   | Variable | Value |
   |---|---|
   | `DATABASE_URL` | app role, pooled URL, `sslmode=require` (use the direct URL if `db:check` failed on the pooled one) |
   | `DB_POOL_MAX` | `1` |
   | `FIELD_KEY_MASTER` | `openssl rand -base64 32`; keep a copy: without it stored documents and provider secrets cannot be decrypted |
   | `OBJECT_STORE` | `postgres` |
   | `ALLOW_UNSCANNED_UPLOADS` | `test-environment-only` |
   | `TRUSTED_PROXY_HOPS` | `1` |
   | `SSO_MODE` | `per_tenant` |
   | `APP_ORIGIN` | `https://<your production domain>` (no trailing slash) |
   Optional: `SESSION_IDLE_MINUTES`, `SESSION_ABSOLUTE_HOURS`, `METRICS_SECRET` (24 or more characters), `WORKER_SECRET` (24 or more characters; the delivery worker is not scheduled in this setup). Deploy.
6. **Keep the test private.** Turn on Vercel's deployment protection for the project so only you can open it [U: setting names not read]. The application's own sign-in still applies.
7. **Smoke test, then walk through it.**
   ```
   workspace/app/scripts/smoke-remote.sh https://<your production domain>
   ```
   Then open `/signin`, type `test-bank`, sign in, and follow workspace/demo/DEMO_SCRIPT.md. The Users screen lets you add colleagues (link their provider subject ids) and the Single sign-on screen shows the callback URL.
8. **Seed synthetic cases** (optional): `POST /api/applications` and document uploads need a session cookie, so do it through the web form `/apply`; the synthetic documents are in `workspace/app/fixtures/`.
9. **Tear down** when finished: delete the Vercel project and the Neon project. Synthetic data only; nothing real was ever loaded.

## What this setup does not test
Malware scanning (disabled by design, banner shown), managed keys (the master key is an environment variable), fixed egress addresses, document storage at scale or beyond 4 MB, the hosted delivery worker, a real model provider (the mock is used), real OCR, and anything about Vercel's behavior that the docs do not state (for example connection limits under load). Findings from the test go into docs/HOSTING_OPTIONS.md.
