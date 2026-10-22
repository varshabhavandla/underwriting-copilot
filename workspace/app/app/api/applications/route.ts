import { ZodError } from "zod";
import { withTenant } from "@/db/client";
import { submitApplication } from "@/application/submit";
import { withRequest, readJson } from "@/http/withRequest";
import { inc } from "@/observability/metrics";
import { services } from "@/server/services";

export const dynamic = "force-dynamic";

export const POST = withRequest("applications", { limit: { max: 30, windowMs: 60_000 }, json: true }, async (req) => {
  const s = services();
  if (!s) return Response.json({ error: "unauthenticated" }, { status: 401 });
  const body = await readJson(req, 64 * 1024);
  if (!body.ok) return Response.json({ error: body.status === 413 ? "body too large" : "invalid json" }, { status: body.status });
  try {
    const r = await withTenant(s.sql, { tenantId: s.tenantId, ...(s.userId ? { userId: s.userId } : {}) }, (tx) => submitApplication(tx, s.keys, s.tenantId, body.value));
    inc("applications_total", { created: String(r.created) });
    return Response.json(r, { status: r.created ? 201 : 200 });
  } catch (e) {
    if (e instanceof ZodError) {
      // paths and messages only; never echo submitted values (they may contain identifiers)
      return Response.json({ error: "validation_failed", issues: e.issues.map((i) => ({ path: i.path.join("."), message: i.message })) }, { status: 400 });
    }
    throw e;
  }
});
