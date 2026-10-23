import { withTenant } from "@/db/client";
import { withRequest } from "@/http/withRequest";
import { caseLive } from "@/review/live";
import { deny } from "@/server/guard";
import { services } from "@/server/services";

export const dynamic = "force-dynamic";
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Progress and counts for one case, polled by the console so it can update itself (D-039). Read-only; ids, states and counts only. */
export const GET = withRequest("case_live", { limit: { max: 240, windowMs: 60_000 } }, async (_req: Request, ctx: { params: Promise<{ caseId: string }> }) => {
  const s = await services();
  const denied = deny(s, "view");
  if (denied) return denied;
  if (!s) throw new Error("unreachable");
  const { caseId } = await ctx.params;
  if (!UUID.test(caseId)) return Response.json({ error: "not found" }, { status: 404 });
  const live = await withTenant(s.sql, { tenantId: s.tenantId }, (tx) => caseLive(tx, caseId));
  if (!live) return Response.json({ error: "not found" }, { status: 404 }); // the same answer for a missing and a foreign case
  return Response.json(live);
});
