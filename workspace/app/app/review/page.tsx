import Link from "next/link";
import { withTenant } from "@/db/client";
import { listCases } from "@/review/queries";
import { services } from "@/server/services";

export const dynamic = "force-dynamic";
const usd = (c: string | null) => (c === null ? "n/a" : `$${(BigInt(c) / 100n).toLocaleString("en-US")}`);

export default async function Review() {
  const s = services();
  if (!s) return <main><h1>Review</h1><p>No authenticated tenant. Sign-in is not built yet (decision D-011).</p></main>;
  const rows = await withTenant(s.sql, { tenantId: s.tenantId }, (tx) => listCases(tx));
  return (
    <main>
      <h1>Files for review</h1>
      <p>The tool prepares files. Only an underwriter decides.</p>
      <table cellPadding={6}>
        <thead><tr><th align="left">Business</th><th align="left">Amount</th><th align="left">Status</th><th align="left">Open exceptions</th><th align="left">Memo</th></tr></thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.id}>
              <td><Link href={`/review/${r.id}`}>{r.legal_name ?? r.case_ref}</Link></td>
              <td>{usd(r.loan_amount_cents)}</td>
              <td>{r.status}</td>
              <td>critical {r.open_critical} / high {r.open_high} / other {r.open_other}</td>
              <td>{r.has_memo ? "drafted" : "none"}</td>
            </tr>
          ))}
        </tbody>
      </table>
      {rows.length === 0 && <p>No cases yet.</p>}
    </main>
  );
}
