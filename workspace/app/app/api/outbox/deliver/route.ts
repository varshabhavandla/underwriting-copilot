import { createHash, timingSafeEqual } from "node:crypto";
import { deliverOutbox } from "@/servicing/deliver";
import { serverEnv } from "@/server-env";
import { services } from "@/server/services";

export const dynamic = "force-dynamic";

const digest = (s: string) => createHash("sha256").update(s).digest();

/**
 * Delivery worker trigger (a scheduled job calls this in production). Disabled unless WORKER_SECRET is set; the secret is compared in
 * constant time. Delivers due events through the servicing adapter and, if configured, a signed webhook.
 */
export async function POST(req: Request): Promise<Response> {
  const env = serverEnv();
  if (!env.WORKER_SECRET) return Response.json({ error: "disabled" }, { status: 404 });
  const given = req.headers.get("authorization")?.replace(/^Bearer /, "") ?? "";
  if (!timingSafeEqual(digest(given), digest(env.WORKER_SECRET))) return Response.json({ error: "unauthorized" }, { status: 401 });
  const s = services();
  if (!s) return Response.json({ error: "unauthenticated" }, { status: 401 });
  const webhook = env.WEBHOOK_URL && env.WEBHOOK_SECRET ? { url: env.WEBHOOK_URL, secret: env.WEBHOOK_SECRET, allowLocal: process.env["NODE_ENV"] !== "production" } : undefined;
  try {
    const r = await deliverOutbox(s.sql, { tenantId: s.tenantId, ...(s.userId ? { userId: s.userId } : {}) }, { adapter: s.servicing, webhook });
    return Response.json(r);
  } catch (e) {
    console.error(JSON.stringify({ level: "error", route: "deliver", message: (e as Error).message }));
    return Response.json({ error: "internal" }, { status: 500 });
  }
}
