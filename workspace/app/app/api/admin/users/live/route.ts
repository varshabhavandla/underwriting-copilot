import { live, usersVersion } from "@/admin/live";
import { listUsers } from "@/admin/queries";
import { withTenant } from "@/db/client";
import { withRequest } from "@/http/withRequest";
import { deny } from "@/server/guard";
import { services } from "@/server/services";

export const dynamic = "force-dynamic";

/** A change token for the users screen, polled so the screen updates itself (D-039). Administrators only; a hash of ids, roles, states and counts, never an email address. */
export const GET = withRequest("admin_users_live", { limit: { max: 240, windowMs: 60_000 } }, async () => {
  const s = await services();
  const denied = deny(s, "admin");
  if (denied) return denied;
  if (!s) throw new Error("unreachable");
  if (!s.userId) return Response.json({ error: "not found" }, { status: 404 });
  const userId = s.userId;
  return Response.json(live(await withTenant(s.sql, { tenantId: s.tenantId, userId }, async (tx) => usersVersion(await listUsers(tx)))));
});
