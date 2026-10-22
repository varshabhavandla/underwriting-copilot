import { createHash, timingSafeEqual } from "node:crypto";
import { withRequest } from "@/http/withRequest";
import { inc } from "@/observability/metrics";
import { deliverOutbox } from "@/servicing/deliver";
import { serverEnv } from "@/server-env";
import { services } from "@/server/services";

export const dynamic = "force-dynamic";

const digest = (s: string) => createHash("sha256").update(s).digest();

/**
 * Delivery worker trigger (a scheduled job calls this in production). Disabled unless WORKER_SECRET is set; the secret is compared in
 * constant time. Delivers due events through the servicing adapter and, if configured, a signed webhook.
 */
export const POST = withRequest("deliver", { limit: { max: 6, windowMs: 60_000 } }, async (req: Request) => {
  const env = serverEnv();
  if (!env.WORKER_SECRET) return Response.json({ error: "disabled" }, { status: 404 });
  const given = req.headers.get("authorization")?.replace(/^Bearer /, "") ?? "";
  if (!timingSafeEqual(digest(given), digest(env.WORKER_SECRET))) return Response.json({ error: "unauthorized" }, { status: 401 });
  const s = services();
  if (!s) return Response.json({ error: "unauthenticated" }, { status: 401 });
  const webhook = env.WEBHOOK_URL && env.WEBHOOK_SECRET ? { url: env.WEBHOOK_URL, secret: env.WEBHOOK_SECRET, allowLocal: process.env["NODE_ENV"] !== "production" } : undefined;
  const r = await deliverOutbox(s.sql, { tenantId: s.tenantId, ...(s.userId ? { userId: s.userId } : {}) }, { adapter: s.servicing, webhook });
  inc("outbox_delivered_total", {}, r.delivered);
  inc("outbox_failed_total", {}, r.failed);
  return Response.json(r);
});
