import { withTenant } from "@/db/client";
import { withRequest } from "@/http/withRequest";
import { queueLive } from "@/review/live";
import { deny } from "@/server/guard";
import { services } from "@/server/services";

export const dynamic = "force-dynamic";

/** The review queue's progress and counts, polled by the console so the list updates itself (D-039). Read-only; ids, states and counts only. */
export const GET = withRequest("queue_live", { limit: { max: 240, windowMs: 60_000 } }, async () => {
  const s = await services();
  const denied = deny(s, "view");
  if (denied) return denied;
  if (!s) throw new Error("unreachable");
  return Response.json(await withTenant(s.sql, { tenantId: s.tenantId }, (tx) => queueLive(tx)));
});
