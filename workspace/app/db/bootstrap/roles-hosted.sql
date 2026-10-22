-- For a HOSTED PostgreSQL (Neon, RDS, Cloud SQL). Run once as the provider's administrator role with psql variables, never with the local development passwords:
--   psql "$ADMIN_URL" -v owner_pw="$(openssl rand -hex 24)" -v app_pw="$(openssl rand -hex 24)" -v dbname=uw -f db/bootstrap/roles-hosted.sql
-- Save the two passwords in your secret store; they are not recoverable. The two roles must NOT be able to bypass row-level security: verify with
--   APP_DATABASE_URL=... OWNER_DATABASE_URL=... npm run db:check
-- uw_owner runs migrations only and owns the tables. uw_app is what the web app uses: no superuser, no BYPASSRLS, owns nothing.
CREATE ROLE uw_owner LOGIN PASSWORD :'owner_pw' NOSUPERUSER NOBYPASSRLS NOCREATEROLE NOCREATEDB;
CREATE ROLE uw_app   LOGIN PASSWORD :'app_pw'   NOSUPERUSER NOBYPASSRLS NOCREATEROLE NOCREATEDB NOINHERIT;
-- some providers require the administrator to be a member of a role before it can make it a database owner
GRANT uw_owner TO CURRENT_USER;
CREATE DATABASE :"dbname" OWNER uw_owner;
