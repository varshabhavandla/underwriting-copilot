import { headers } from "next/headers";
import { cookieValue, resolveSession, SESSION_COOKIE, type Role } from "../auth/session";
import { loadTenantIdp } from "../auth/idp";
import type { OidcConfig } from "../auth/oidc";
import { LocalKeyProvider, masterKeyFromEnv } from "../crypto/fieldCrypto";
import { connect, withTenant, type Sql } from "../db/client";
import { DEFAULT_OPTIONS, LlmGateway } from "../llm/gateway";
import { MockProvider } from "../llm/mockProvider";
import { MockServicingAdapter } from "../servicing/mock";
import { LocalObjectStore, PgObjectStore, type ObjectStore } from "../storage/objectStore";
import { ClamdScanner, NoScanner, type MalwareScanner } from "../storage/scanner";
import { serverEnv } from "../server-env";

export interface Infra {
  sql: Sql;
  keys: LocalKeyProvider;
  store: ObjectStore;
  gateway: LlmGateway;
  servicing: MockServicingAdapter;
  scanner: MalwareScanner;
}
/** Infrastructure plus the identity of the caller for this request. */
export interface Services extends Infra {
  tenantId: string;
  userId: string | undefined;
  role: Role | undefined;
  sessionId: string | undefined;
}

const g = globalThis as unknown as { __uw?: Infra; __uwDevRole?: Role | null };

/** Wires local-development services. Production replaces the key provider, store and model provider (D-013, D-015). */
export function infra(): Infra {
  const env = serverEnv();
  if (env.OBJECT_STORE === "local" && !env.UPLOAD_DIR) throw new Error("UPLOAD_DIR is required when OBJECT_STORE is local");
  g.__uw ??= (() => {
    const keys = new LocalKeyProvider(masterKeyFromEnv());
    const sql = connect(env.DATABASE_URL, env.DB_POOL_MAX);
    return {
      sql,
      keys,
      store: env.OBJECT_STORE === "postgres" ? new PgObjectStore(sql, keys) : new LocalObjectStore(env.UPLOAD_DIR!, keys),
      gateway: new LlmGateway(new MockProvider("faithful"), DEFAULT_OPTIONS),
      servicing: new MockServicingAdapter("ok"),
      scanner: env.CLAMD_HOST ? new ClamdScanner(env.CLAMD_HOST, env.CLAMD_PORT) : new NoScanner(),
    };
  })();
  return g.__uw;
}

export type AuthMode = "per_tenant" | "global" | "dev";
export function authMode(): AuthMode {
  const e = serverEnv();
  if (e.SSO_MODE === "per_tenant") return "per_tenant";
  return e.OIDC_ISSUER && e.OIDC_CLIENT_ID && e.OIDC_REDIRECT_URI ? "global" : "dev";
}
export const authEnabled = (): boolean => authMode() !== "dev";

/** The deployment-wide provider (SSO_MODE global). */
export function globalIdp(): OidcConfig | null {
  const e = serverEnv();
  if (e.SSO_MODE !== "global" || !e.OIDC_ISSUER || !e.OIDC_CLIENT_ID || !e.OIDC_REDIRECT_URI) return null;
  return {
    issuer: e.OIDC_ISSUER, clientId: e.OIDC_CLIENT_ID, clientSecret: e.OIDC_CLIENT_SECRET, redirectUri: e.OIDC_REDIRECT_URI,
    requiredAmr: (e.OIDC_REQUIRED_AMR ?? "").split(",").map((x) => x.trim()).filter(Boolean),
  };
}

/** The one callback URL every organization's provider is told about. */
export const callbackUri = (): string => {
  const e = serverEnv();
  return e.SSO_MODE === "per_tenant" ? `${e.APP_ORIGIN!.replace(/\/$/, "")}/api/auth/callback` : e.OIDC_REDIRECT_URI!;
};

/** The canonical origin of this application, used to check that state-changing form posts come from our own pages. */
export const appOrigin = (): string | null => {
  const e = serverEnv();
  if (e.APP_ORIGIN) return new URL(e.APP_ORIGIN).origin;
  return e.OIDC_REDIRECT_URI ? new URL(e.OIDC_REDIRECT_URI).origin : null;
};

/** The provider configured by an organization's administrator, found by the organization name typed at sign-in. Null when unknown, disabled or incomplete. */
export async function tenantIdp(slug: string): Promise<(OidcConfig & { tenantId: string }) | null> {
  const { sql, keys } = infra();
  return loadTenantIdp(sql, keys, slug, callbackUri());
}

/**
 * Who is calling. With OIDC configured, only a valid session counts and the DEV_* identity is ignored. Without it (local development only; production
 * refuses to start that way) the DEV_* identity is used, with its role read from the database.
 */
export async function services(): Promise<Services | null> {
  const env = serverEnv();
  const base = infra();
  if (authEnabled()) {
    const cookie = (await headers()).get("cookie");
    const id = await resolveSession(base.sql, cookieValue(cookie, SESSION_COOKIE), env.SESSION_IDLE_MINUTES * 60);
    return id ? { ...base, tenantId: id.tenantId, userId: id.userId, role: id.role, sessionId: id.sessionId } : null;
  }
  if (!env.DEV_TENANT_ID) return null;
  if (g.__uwDevRole === undefined) {
    g.__uwDevRole = env.DEV_USER_ID
      ? (await withTenant(base.sql, { tenantId: env.DEV_TENANT_ID }, (tx) => tx<{ role: Role }[]>`select role from users where id = ${env.DEV_USER_ID!}`))[0]?.role ?? null
      : null;
  }
  return { ...base, tenantId: env.DEV_TENANT_ID, userId: env.DEV_USER_ID, role: g.__uwDevRole ?? undefined, sessionId: undefined };
}

/** For the delivery worker, which authenticates with its own secret and acts for a tenant named by the caller, not for a user. */
export function workerServices(tenantId: string): Services {
  return { ...infra(), tenantId, userId: undefined, role: undefined, sessionId: undefined };
}

/** The caller's own session token (for flagging "this session" and keeping it when ending the others). */
export async function currentSessionToken(): Promise<string | null> {
  return cookieValue((await headers()).get("cookie"), SESSION_COOKIE);
}
