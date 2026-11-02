import { live, sessionsVersion } from "@/admin/live";
import { listMySessions } from "@/admin/queries";
import { hashToken } from "@/auth/session";
import { withTenant } from "@/db/client";
import { withRequest } from "@/http/withRequest";
import { deny } from "@/server/guard";
import { currentSessionToken, services } from "@/server/services";

export const dynamic = "force-dynamic";

/** A change token for the caller's own sessions screen, polled so the screen updates itself (D-039). Only the caller's own sessions are ever read. */
export const GET = withRequest("account_live", { limit: { max: 240, windowMs: 60_000 } }, async () => {
  const s = await services();
  const denied = deny(s, "account");
  if (denied) return denied;
  if (!s) throw new Error("unreachable");
  if (!s.userId) return Response.json({ error: "not found" }, { status: 404 });
  const userId = s.userId;
  const currentHash = hashToken((await currentSessionToken()) ?? "");
  return Response.json(live(await withTenant(s.sql, { tenantId: s.tenantId, userId }, async (tx) => sessionsVersion(await listMySessions(tx, currentHash)))));
});
