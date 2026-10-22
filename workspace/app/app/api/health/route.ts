import { withRequest } from "@/http/withRequest";

export const dynamic = "force-dynamic";

/** Liveness only: no data, no database call, safe to expose. */
export const GET = withRequest("health", { limit: { max: 120, windowMs: 60_000 } }, async () => Response.json({ status: "ok" }));
