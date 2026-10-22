import { ZodError } from "zod";
import { withTenant } from "@/db/client";
import { submitApplication } from "@/application/submit";
import { services } from "@/server/services";

export const dynamic = "force-dynamic";
const MAX_BODY = 64 * 1024;

export async function POST(req: Request): Promise<Response> {
  const s = services();
  if (!s) return Response.json({ error: "unauthenticated" }, { status: 401 });
  const text = await req.text();
  if (text.length > MAX_BODY) return Response.json({ error: "body too large" }, { status: 413 });
  let body: unknown;
  try {
    body = JSON.parse(text);
  } catch {
    return Response.json({ error: "invalid json" }, { status: 400 });
  }
  try {
    const r = await withTenant(s.sql, { tenantId: s.tenantId, ...(s.userId ? { userId: s.userId } : {}) }, (tx) => submitApplication(tx, s.keys, s.tenantId, body));
    return Response.json(r, { status: r.created ? 201 : 200 });
  } catch (e) {
    if (e instanceof ZodError) {
      // paths and messages only; never echo submitted values (they may contain identifiers)
      return Response.json({ error: "validation_failed", issues: e.issues.map((i) => ({ path: i.path.join("."), message: i.message })) }, { status: 400 });
    }
    console.error(JSON.stringify({ level: "error", route: "applications", message: (e as Error).message }));
    return Response.json({ error: "internal" }, { status: 500 });
  }
}
