import { z } from "zod";
import { withRequest, readJson } from "@/http/withRequest";
import { inc } from "@/observability/metrics";
import { ActionDenied, decideCase } from "@/review/actions";
import { services } from "@/server/services";

export const dynamic = "force-dynamic";
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const Body = z.object({ decision: z.enum(["approve", "decline", "request_more_info"]), reasons: z.array(z.string().min(1).max(1000)).min(1).max(20), overrides: z.array(z.string().min(1).max(1000)).max(20).default([]) }).strict();

/** JSON form of the reviewer's decision, same code path as the console. The database decides whether the actor may do this. */
export const POST = withRequest("decision", { limit: { max: 20, windowMs: 60_000 }, json: true }, async (req: Request, ctx: { params: Promise<{ caseId: string }> }) => {
  const s = services();
  if (!s) return Response.json({ error: "unauthenticated" }, { status: 401 });
  const { caseId } = await ctx.params;
  if (!UUID.test(caseId)) return Response.json({ error: "not found" }, { status: 404 });
  const raw = await readJson(req, 16 * 1024);
  if (!raw.ok) return Response.json({ error: raw.status === 413 ? "body too large" : "invalid json" }, { status: raw.status });
  const parsed = Body.safeParse(raw.value);
  if (!parsed.success) return Response.json({ error: "validation_failed", issues: parsed.error.issues.map((i) => ({ path: i.path.join("."), message: i.message })) }, { status: 400 });
  try {
    const r = await decideCase(s.sql, { tenantId: s.tenantId, ...(s.userId ? { userId: s.userId } : {}) }, { caseId, ...parsed.data });
    inc("decisions_total", { decision: parsed.data.decision });
    return Response.json(r);
  } catch (e) {
    if (e instanceof ActionDenied) return Response.json({ error: e.message }, { status: e.message === "case not found" ? 404 : 403 });
    throw e;
  }
});
