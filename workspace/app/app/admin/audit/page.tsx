import Link from "next/link";
import { eventsVersion } from "@/admin/live";
import { listSecurityEvents } from "@/admin/queries";
import { withTenant } from "@/db/client";
import { requireSession } from "@/server/guard";
import { LiveRefresh } from "../../review/live-refresh";

export const dynamic = "force-dynamic";

export default async function SecurityEvents() {
  const s = await requireSession("admin", "/admin/audit");
  const rows = await withTenant(s.sql, { tenantId: s.tenantId, userId: s.userId! }, (tx) => listSecurityEvents(tx));
  return (
    <main>
      <p><Link href="/admin/users">← Users and access</Link></p>
      <h1>Security events</h1>
      <p>Sign-ins, sign-outs, session endings and administration changes from the tamper-evident audit ledger. Failed sign-ins are recorded in the server log with a reason, not here, because no tenant is known yet. New events appear here by themselves.</p>
      <LiveRefresh url="/api/admin/audit/live" version={eventsVersion(rows)} active={false} slowMs={5000} />
      <table>
        <thead><tr><th>#</th><th>When (UTC)</th><th>Event</th><th>By</th><th>Details</th></tr></thead>
        <tbody>{rows.map((r) => <tr key={r.seq}><td>{r.seq}</td><td>{r.at.slice(0, 19)}</td><td>{r.action}</td><td>{r.actor ?? "system"}</td><td><code>{JSON.stringify(r.subject)}</code></td></tr>)}</tbody>
      </table>
      {rows.length === 0 && <p>No events yet.</p>}
    </main>
  );
}
