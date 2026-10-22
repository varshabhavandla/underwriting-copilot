import postgres from "postgres";

export type Sql = postgres.Sql;
export type Tx = postgres.TransactionSql;

export interface TenantContext {
  tenantId: string;
  /** Authenticated user, when there is one. Required by policies that check the actor (decisions). */
  userId?: string;
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** `max` is the pool size per process. Serverless hosts should use 1 (each instance holds its own pool, so many instances multiply it). */
export function connect(url: string, max = 5): Sql {
  return postgres(url, { onnotice: () => {}, max, idle_timeout: 20 });
}

/**
 * Run `fn` inside a transaction with the tenant (and user) set for row-level security.
 * set_config(..., true) is transaction-local, so it is safe with transaction-mode connection pooling
 * and cannot leak to the next request that reuses the connection.
 * The tenant id MUST come from the verified session, never from a request body.
 */
export async function withTenant<T>(sql: Sql, ctx: TenantContext, fn: (tx: Tx) => Promise<T>): Promise<T> {
  if (!UUID.test(ctx.tenantId)) throw new Error("invalid tenant id");
  if (ctx.userId !== undefined && !UUID.test(ctx.userId)) throw new Error("invalid user id");
  return (await sql.begin(async (tx) => {
    await tx`select set_config('app.tenant_id', ${ctx.tenantId}, true)`;
    await tx`select set_config('app.user_id', ${ctx.userId ?? ""}, true)`;
    return fn(tx);
  })) as T;
}
