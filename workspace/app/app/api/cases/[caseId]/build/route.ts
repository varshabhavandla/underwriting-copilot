import { buildFile } from "@/file/buildFile";
import { withRequest } from "@/http/withRequest";
import { inc } from "@/observability/metrics";
import { deny } from "@/server/guard";
import { services } from "@/server/services";

export const dynamic = "force-dynamic";
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Runs the rule pack and drafts the memo for a case. It never approves or declines; the case ends in needs_review. */
export const POST = withRequest("build", { limit: { max: 10, windowMs: 60_000 } }, async (_req: Request, ctx: { params: Promise<{ caseId: string }> }) => {
  const s = await services();
  const denied = deny(s, "build");
  if (denied) return denied;
  if (!s) throw new Error("unreachable");
  const { caseId } = await ctx.params;
  if (!UUID.test(caseId)) return Response.json({ error: "not found" }, { status: 404 });
  try {
    const r = await buildFile(s.sql, s.gateway, { tenantId: s.tenantId, ...(s.userId ? { userId: s.userId } : {}) }, caseId, new Date());
    inc("file_builds_total", { memo: String(r.memoStored) });
    const count = (o: string) => r.results.filter((x) => x.outcome === o).length;
    return Response.json({
      runId: r.runId,
      rules: { pass: count("pass"), fail: count("fail"), needs_review: count("needs_review"), not_applicable: count("not_applicable") },
      memoStored: r.memoStored,
      memoProblems: r.memoProblems.length,
      exceptionsRaised: r.exceptionsRaised,
      status: "needs_review",
    });
  } catch (e) {
    if (/no application for this case/.test((e as Error).message)) return Response.json({ error: "not found" }, { status: 404 });
    throw e;
  }
});
