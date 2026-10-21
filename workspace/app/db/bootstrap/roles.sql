-- Run once as a Postgres superuser. LOCAL DEVELOPMENT passwords only; production uses secrets from the platform store.
-- uw_owner: owns tables, used only by migrations. uw_app: used by the application; no superuser, no BYPASSRLS, not an owner.
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'uw_owner') THEN
    CREATE ROLE uw_owner LOGIN PASSWORD 'uw_owner_dev' NOSUPERUSER NOBYPASSRLS NOCREATEROLE NOCREATEDB;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'uw_app') THEN
    CREATE ROLE uw_app LOGIN PASSWORD 'uw_app_dev' NOSUPERUSER NOBYPASSRLS NOCREATEROLE NOCREATEDB NOINHERIT;
  END IF;
END
$$;
