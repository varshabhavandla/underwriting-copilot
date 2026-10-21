import { connect, withTenant } from "@/db/client";
import { serverEnv } from "@/server-env";

export const dynamic = "force-dynamic";

interface Row {
  id: string;
  case_ref: string;
  status: string;
}

export default async function Home() {
  const env = serverEnv();
  if (!env.DEV_TENANT_ID) {
    return (
      <main>
        <h1>Underwriting Copilot</h1>
        <p>No authenticated tenant. Sign-in is not built yet (decision D-011).</p>
      </main>
    );
  }
  const sql = connect(env.DATABASE_URL);
  try {
    const rows = await withTenant(sql, { tenantId: env.DEV_TENANT_ID }, (tx) => tx<Row[]>`select id, case_ref, status from cases order by created_at desc limit 50`);
    return (
      <main>
        <h1>Cases</h1>
        <p>Every file needs an authorized underwriter&apos;s decision. Showing tenant data through row-level security.</p>
        <table>
          <thead>
            <tr><th align="left">Reference</th><th align="left">Status</th></tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.id}><td>{r.case_ref}</td><td>{r.status}</td></tr>
            ))}
          </tbody>
        </table>
        {rows.length === 0 && <p>No cases yet.</p>}
      </main>
    );
  } finally {
    await sql.end();
  }
}
