import { withRequest } from "@/http/withRequest";
import { receiveDocument } from "@/ingest/receive";
import { deny } from "@/server/guard";
import { services } from "@/server/services";

export const dynamic = "force-dynamic";

/**
 * Upload path for API callers (multipart, capped below the hosting body limit); the console's upload form uses the same function. Production uploads will go
 * directly to object storage with a signed URL. Content type is decided by content, not by file name. Only text documents are ingested; PDFs and images are
 * stored and routed to manual review because no OCR provider is wired yet.
 */
export const POST = withRequest("documents", { limit: { max: 30, windowMs: 60_000 } }, async (req: Request, ctx: { params: Promise<{ caseId: string }> }) => {
  const s = await services();
  const denied = deny(s, "intake");
  if (denied) return denied;
  if (!s) throw new Error("unreachable");
  const { caseId } = await ctx.params;
  const form = await req.formData().catch(() => null);
  const file = form?.get("file");
  if (!(file instanceof File)) return Response.json({ error: "file and a valid docType are required" }, { status: 400 });
  const r = await receiveDocument(s, caseId, { name: file.name, bytes: Buffer.from(await file.arrayBuffer()) }, String(form?.get("docType") ?? ""));
  return Response.json(r.body, { status: r.status, ...(r.headers ? { headers: r.headers } : {}) });
});
