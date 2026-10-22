import { headers } from "next/headers";
import { cookieValue, resolveSession, SESSION_COOKIE, type Role } from "../auth/session";
import type { OidcConfig } from "../auth/oidc";
import { LocalKeyProvider, masterKeyFromEnv } from "../crypto/fieldCrypto";
import { connect, withTenant, type Sql } from "../db/client";
import { DEFAULT_OPTIONS, LlmGateway } from "../llm/gateway";
import { MockProvider } from "../llm/mockProvider";
import { MockServicingAdapter } from "../servicing/mock";
import { LocalObjectStore } from "../storage/objectStore";
import { serverEnv } from "../server-env";

export interface Infra {
  sql: Sql;
  keys: LocalKeyProvider;
  store: LocalObjectStore;
  gateway: LlmGateway;
  servicing: MockServicingAdapter;
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
  if (!env.UPLOAD_DIR) throw new Error("UPLOAD_DIR is required");
  g.__uw ??= (() => {
    const keys = new LocalKeyProvider(masterKeyFromEnv());
    return {
      sql: connect(env.DATABASE_URL),
      keys,
      store: new LocalObjectStore(env.UPLOAD_DIR!, keys),
      gateway: new LlmGateway(new MockProvider("faithful"), DEFAULT_OPTIONS),
      servicing: new MockServicingAdapter("ok"),
    };
  })();
  return g.__uw;
}

export function oidcConfig(): OidcConfig | null {
  const e = serverEnv();
  if (!e.OIDC_ISSUER || !e.OIDC_CLIENT_ID || !e.OIDC_REDIRECT_URI) return null;
  return {
    issuer: e.OIDC_ISSUER, clientId: e.OIDC_CLIENT_ID, clientSecret: e.OIDC_CLIENT_SECRET, redirectUri: e.OIDC_REDIRECT_URI,
    requiredAmr: (e.OIDC_REQUIRED_AMR ?? "").split(",").map((x) => x.trim()).filter(Boolean),
  };
}

/** The canonical origin of this application, used to check that state-changing form posts come from our own pages. */
export const appOrigin = (): string | null => { const c = oidcConfig(); return c ? new URL(c.redirectUri).origin : null; };

/**
 * Who is calling. With OIDC configured, only a valid session counts and the DEV_* identity is ignored. Without it (local development only; production
 * refuses to start that way) the DEV_* identity is used, with its role read from the database.
 */
export async function services(): Promise<Services | null> {
  const env = serverEnv();
  const base = infra();
  if (oidcConfig()) {
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
