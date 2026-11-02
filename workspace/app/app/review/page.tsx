import Link from "next/link";
import { withTenant } from "@/db/client";
import { queueLive } from "@/review/live";
import { listCases } from "@/review/queries";
import { LiveRefresh } from "./live-refresh";
import { requireSession } from "@/server/guard";

export const dynamic = "force-dynamic";
const usd = (c: string | null) => (c === null ? "n/a" : `$${(BigInt(c) / 100n).toLocaleString("en-US")}`);

export default async function Review() {
  const s = await requireSession("view", "/review");
  const [rows, live] = await withTenant(s.sql, { tenantId: s.tenantId }, async (tx) => [await listCases(tx), await queueLive(tx)] as const);
  const processing = new Map(live.cases.map((c) => [c.id, c.processing]));
  return (
    <main>
      <h1>Files for review</h1>
      <p className="lede">The tool prepares files. Only an underwriter decides.</p>
      <LiveRefresh url="/api/queue/live" version={live.version} active={live.active} />
      <table cellPadding={6}>
        <thead><tr><th align="left">Business</th><th align="left">Amount</th><th align="left">Status</th><th align="left">Open exceptions</th><th align="left">Memo</th></tr></thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.id}>
              <td><Link href={`/review/${r.id}`}>{r.legal_name ?? r.case_ref}</Link></td>
              <td>{usd(r.loan_amount_cents)}</td>
              <td><span className={`badge badge-${r.status}`}>{r.status}</span>{(processing.get(r.id) ?? 0) > 0 ? ` (processing ${processing.get(r.id)})` : ""}</td>
              <td>critical <span className={r.open_critical > 0 ? "sev-crit" : undefined}>{r.open_critical}</span> / high <span className={r.open_high > 0 ? "sev-high" : undefined}>{r.open_high}</span> / other {r.open_other}</td>
              <td>{r.has_memo ? "drafted" : "none"}</td>
            </tr>
          ))}
        </tbody>
      </table>
      {rows.length === 0 && <p>No cases yet.</p>}
    </main>
  );
}
