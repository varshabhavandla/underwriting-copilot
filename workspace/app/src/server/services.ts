import { LocalKeyProvider, masterKeyFromEnv } from "../crypto/fieldCrypto";
import { connect, type Sql } from "../db/client";
import { DEFAULT_OPTIONS, LlmGateway } from "../llm/gateway";
import { MockProvider } from "../llm/mockProvider";
import { LocalObjectStore } from "../storage/objectStore";
import { serverEnv } from "../server-env";

export interface Services {
  sql: Sql;
  keys: LocalKeyProvider;
  store: LocalObjectStore;
  gateway: LlmGateway;
  tenantId: string;
  userId: string | undefined;
}

const g = globalThis as unknown as { __uw?: Services };

/** Wires local-development services. Production replaces the key provider, store and model provider (D-013, D-015) and the tenant source (D-011). */
export function services(): Services | null {
  const env = serverEnv();
  if (!env.DEV_TENANT_ID) return null; // no authenticated tenant
  if (!env.UPLOAD_DIR) throw new Error("UPLOAD_DIR is required");
  g.__uw ??= (() => {
    const keys = new LocalKeyProvider(masterKeyFromEnv());
    return {
      sql: connect(env.DATABASE_URL),
      keys,
      store: new LocalObjectStore(env.UPLOAD_DIR!, keys),
      gateway: new LlmGateway(new MockProvider("faithful"), DEFAULT_OPTIONS),
      tenantId: env.DEV_TENANT_ID!,
      userId: env.DEV_USER_ID,
    };
  })();
  return g.__uw;
}
