import Link from "next/link";
import { withTenant } from "@/db/client";
import { queueLive } from "@/review/live";
import { listCases } from "@/review/queries";
import { requireSession } from "@/server/guard";
import { Bars, Donut } from "../charts";
import { statusLabel, usd, usdCompact } from "../format";
import { Icon, type IconName } from "../icons";
import { LiveRefresh } from "../review/live-refresh";
import { PageHeader } from "../ui";

export const dynamic = "force-dynamic";
export const metadata = { title: "Dashboard | Fortech Underwriting Portal" };

const STATUS_ORDER = ["needs_review", "handed_off", "approved", "declined"] as const;

const EXPLORE: { href: string; icon: IconName; tone: string; title: string; text: string }[] = [
  { href: "/why-fortech", icon: "target", tone: "", title: "Why Fortech", text: "What the portal is built around, and what it does not do yet." },
  { href: "/how-the-ai-works", icon: "spark", tone: "tone-teal", title: "How the AI works", text: "Follow a file from uploaded documents to a cited memo and a human decision." },
  { href: "/security-trust", icon: "shield", tone: "tone-green", title: "Security & trust", text: "How data is isolated, encrypted, audited and protected from hostile documents." },
];

export default async function Dashboard() {
  const s = await requireSession("view", "/dashboard");
  const [rows, live] = await withTenant(s.sql, { tenantId: s.tenantId }, async (tx) => [await listCases(tx), await queueLive(tx)] as const);

  const count = (status: string) => rows.filter((r) => r.status === status).length;
  const known = new Set<string>(STATUS_ORDER);
  const other = rows.filter((r) => !known.has(r.status)).length;
  const parts = [
    ...STATUS_ORDER.map((k) => ({ key: k, label: statusLabel(k), value: count(k) })),
    ...(other > 0 ? [{ key: "other", label: "Other", value: other }] : []),
  ];
  const critical = rows.reduce((t, r) => t + r.open_critical, 0);
  const high = rows.reduce((t, r) => t + r.open_high, 0);
  const minor = rows.reduce((t, r) => t + r.open_other, 0);
  const volume = rows.reduce((t, r) => t + (r.loan_amount_cents ? BigInt(r.loan_amount_cents) : 0n), 0n);
  const memos = rows.filter((r) => r.has_memo).length;
  const attention = rows
    .filter((r) => r.status === "needs_review")
    .sort((a, b) => b.open_critical - a.open_critical || b.open_high - a.open_high || b.open_other - a.open_other)
    .slice(0, 5);

  return (
    <main>
      <PageHeader eyebrow="Overview" title="Dashboard" subtitle="A live view of your files. This page refreshes by itself as documents finish processing.">
        <Link href="/review" className="btn">Open files <Icon name="arrow" size={16} /></Link>
      </PageHeader>
      <LiveRefresh url="/api/queue/live" version={live.version} active={live.active} />

      <div className="kpis">
        <div className="kpi"><div className="kpi-top"><span className="kpi-label">Files in the portal</span><span className="icon-chip"><Icon name="files" /></span></div><div className="kpi-value">{rows.length}</div><div className="kpi-hint">{memos} with a drafted memo</div></div>
        <div className="kpi"><div className="kpi-top"><span className="kpi-label">Awaiting an underwriter</span><span className="icon-chip tone-amber"><Icon name="clock" /></span></div><div className="kpi-value">{count("needs_review")}</div><div className="kpi-hint">{count("handed_off") + count("approved") + count("declined")} already decided</div></div>
        <div className="kpi"><div className="kpi-top"><span className="kpi-label">Open critical and high</span><span className="icon-chip tone-red"><Icon name="shield" /></span></div><div className="kpi-value">{critical + high}</div><div className="kpi-hint">{critical} critical, {high} high</div></div>
        <div className="kpi"><div className="kpi-top"><span className="kpi-label">Requested volume</span><span className="icon-chip tone-green"><Icon name="scale" /></span></div><div className="kpi-value">{usdCompact(volume)}</div><div className="kpi-hint">across {rows.length} {rows.length === 1 ? "file" : "files"}</div></div>
      </div>

      <div className="grid-2">
        <div className="card">
          <div className="card-head"><h2>Where the files are</h2></div>
          {rows.length === 0 ? <p className="empty">No files yet. Submit an application to see it here.</p> : <Donut parts={parts} caption="files" />}
        </div>
        <div className="card">
          <div className="card-head"><h2>Open exceptions by severity</h2></div>
          <Bars items={[{ key: "critical", label: "Critical", value: critical }, { key: "high", label: "High", value: high }, { key: "other", label: "Medium and low", value: minor }]} />
        </div>
      </div>

      <div className="card" style={{ marginTop: 18 }}>
        <div className="card-head"><h2>Needs your attention</h2><Link href="/review">All files</Link></div>
        {attention.length === 0 ? <p className="empty">Nothing is waiting for review.</p> : (
          <div className="table-wrap">
            <table>
              <thead><tr><th>Business</th><th>Amount</th><th>Open exceptions</th><th /></tr></thead>
              <tbody>
                {attention.map((r) => (
                  <tr key={r.id}>
                    <td><Link href={`/review/${r.id}`}>{r.legal_name ?? r.case_ref}</Link></td>
                    <td>{usd(r.loan_amount_cents)}</td>
                    <td>critical <span className={r.open_critical > 0 ? "sev-crit" : undefined}>{r.open_critical}</span> / high <span className={r.open_high > 0 ? "sev-high" : undefined}>{r.open_high}</span> / other {r.open_other}</td>
                    <td><Link href={`/review/${r.id}`}>Review</Link></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <h2 className="section-title">Explore the platform</h2>
      <p className="section-sub">Three short pages that explain how Fortech works, in plain language.</p>
      <div className="grid-3">
        {EXPLORE.map((e) => (
          <Link key={e.href} href={e.href} className="card link-card feature">
            <span className={`icon-chip ${e.tone}`}><Icon name={e.icon} size={22} /></span>
            <h3>{e.title}<span className="go"><Icon name="arrow" size={18} /></span></h3>
            <p>{e.text}</p>
          </Link>
        ))}
      </div>
    </main>
  );
}
