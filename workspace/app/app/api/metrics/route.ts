import { createHash, timingSafeEqual } from "node:crypto";
import { withRequest } from "@/http/withRequest";
import { render } from "@/observability/metrics";
import { serverEnv } from "@/server-env";

export const dynamic = "force-dynamic";
const digest = (s: string) => createHash("sha256").update(s).digest();

/** Prometheus text for this process. Disabled unless METRICS_SECRET is set; compared in constant time. */
export const GET = withRequest("metrics", { limit: { max: 30, windowMs: 60_000 } }, async (req) => {
  const secret = serverEnv().METRICS_SECRET;
  if (!secret) return Response.json({ error: "disabled" }, { status: 404 });
  const given = req.headers.get("authorization")?.replace(/^Bearer /, "") ?? "";
  if (!timingSafeEqual(digest(given), digest(secret))) return Response.json({ error: "unauthorized" }, { status: 401 });
  return new Response(render(), { headers: { "content-type": "text/plain; version=0.0.4" } });
});
