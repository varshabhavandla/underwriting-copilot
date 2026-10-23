import { after } from "next/server";
import { withRequest } from "@/http/withRequest";
import { processDocument } from "@/ingest/processing";
import { receiveDocument } from "@/ingest/receive";
import { deny } from "@/server/guard";
import { services } from "@/server/services";

export const dynamic = "force-dynamic";

/**
 * Upload path for API callers (multipart, capped below the hosting body limit); the console's upload form uses the same function. Production uploads will go
 * directly to object storage with a signed URL. Content type is decided by content, not by file name. Text and text-layer PDFs are read exactly; scans and
 * images are read by OCR and their facts are held for a person (D-037). By default the request waits for processing; with ?async=1 it returns 202 as soon as
 * the document is queued and processing continues after the response (poll GET /api/cases/{id}/live).
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
  const wait = new URL(req.url).searchParams.get("async") !== "1";
  const r = await receiveDocument(s, caseId, { name: file.name, bytes: Buffer.from(await file.arrayBuffer()) }, String(form?.get("docType") ?? ""), { wait });
  if (!wait && r.documentId) { const id = r.documentId; after(async () => { await processDocument(s, id); }); }
  return Response.json(r.body, { status: r.status, ...(r.headers ? { headers: r.headers } : {}) });
});
