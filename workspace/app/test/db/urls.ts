/** UW_TEST_ADMIN_URL: a superuser URL on a disposable local Postgres, e.g. postgres://postgres@127.0.0.1:54329/postgres */
export const adminBase = process.env["UW_TEST_ADMIN_URL"];
export const dbEnabled = Boolean(adminBase);
const DB = "uw_test";

function withCreds(user: string, password: string, db: string): string {
  const u = new URL(adminBase ?? "postgres://localhost/postgres");
  u.username = user;
  u.password = password;
  u.pathname = `/${db}`;
  return u.toString();
}

export const urls = {
  admin: () => withCreds(new URL(adminBase!).username, new URL(adminBase!).password, "postgres"),
  adminOnTestDb: () => withCreds(new URL(adminBase!).username, new URL(adminBase!).password, DB),
  owner: () => withCreds("uw_owner", "uw_owner_dev", DB),
  app: () => withCreds("uw_app", "uw_app_dev", DB),
  dbName: DB,
};
