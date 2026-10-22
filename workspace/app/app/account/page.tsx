import Link from "next/link";
import { redirect } from "next/navigation";
import { revokeMyOtherSessions, revokeMySession, type Outcome } from "@/admin/actions";
import { listMySessions } from "@/admin/queries";
import { hashToken } from "@/auth/session";
import { withTenant } from "@/db/client";
import { requireSession } from "@/server/guard";
import { currentSessionToken } from "@/server/services";

export const dynamic = "force-dynamic";
const back = (o: Outcome) => redirect(`/account?${o.ok ? "msg" : "err"}=${encodeURIComponent(o.message)}`);

async function endOne(f: FormData): Promise<void> {
  "use server";
  const s = await requireSession("account", "/account");
  return back(await revokeMySession(s.sql, { tenantId: s.tenantId, userId: s.userId! }, String(f.get("sessionId") ?? "")));
}
async function endOthers(): Promise<void> {
  "use server";
  const s = await requireSession("account", "/account");
  const tok = await currentSessionToken();
  return back(await revokeMyOtherSessions(s.sql, { tenantId: s.tenantId, userId: s.userId! }, hashToken(tok ?? "")));
}

export default async function Account({ searchParams }: { searchParams: Promise<{ msg?: string; err?: string }> }) {
  const s = await requireSession("account", "/account");
  const { msg, err } = await searchParams;
  if (!s.userId) return <main><h1>Your sessions</h1><p>Sessions exist only when sign-in is configured.</p></main>;
  const tok = await currentSessionToken();
  const rows = await withTenant(s.sql, { tenantId: s.tenantId, userId: s.userId }, (tx) => listMySessions(tx, hashToken(tok ?? "")));
  return (
    <main>
      <p><Link href="/review">← Files</Link></p>
      <h1>Your sessions</h1>
      <p>Each browser you are signed in on. End any you do not recognize.</p>
      {msg && <p role="status">{msg}</p>}
      {err && <p role="alert">{err}</p>}
      <table>
        <thead><tr><th>Browser</th><th>Signed in (UTC)</th><th>Last active (UTC)</th><th>Ends (UTC)</th><th></th></tr></thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.id}>
              <td>{r.user_agent ?? "unknown"}{r.is_current ? " (this session)" : ""}</td>
              <td>{r.created_at.slice(0, 16)}</td><td>{r.last_seen_at.slice(0, 16)}</td><td>{r.expires_at.slice(0, 16)}</td>
              <td>{r.is_current ? null : <form action={endOne}><input type="hidden" name="sessionId" value={r.id} /><button>End</button></form>}</td>
            </tr>))}
        </tbody>
      </table>
      {rows.length > 1 && <form action={endOthers} style={{ marginTop: 12 }}><button>End all other sessions</button></form>}
    </main>
  );
}
