import { eventsVersion, live } from "@/admin/live";
import { listSecurityEvents } from "@/admin/queries";
import { withTenant } from "@/db/client";
import { withRequest } from "@/http/withRequest";
import { deny } from "@/server/guard";
import { services } from "@/server/services";

export const dynamic = "force-dynamic";

/** A change token for the security events screen, polled so the screen updates itself (D-039). Administrators only; a hash of the newest event's sequence number. */
export const GET = withRequest("admin_audit_live", { limit: { max: 240, windowMs: 60_000 } }, async () => {
  const s = await services();
  const denied = deny(s, "admin");
  if (denied) return denied;
  if (!s) throw new Error("unreachable");
  if (!s.userId) return Response.json({ error: "not found" }, { status: 404 });
  const userId = s.userId;
  return Response.json(live(await withTenant(s.sql, { tenantId: s.tenantId, userId }, async (tx) => eventsVersion(await listSecurityEvents(tx, 1)))));
});
