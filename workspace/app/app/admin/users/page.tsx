import Link from "next/link";
import { redirect } from "next/navigation";
import { createUser, linkIdentity, revokeUserSessions, setUserDisabled, setUserRole, unlinkIdentity, type Outcome } from "@/admin/actions";
import { listUsers } from "@/admin/queries";
import { withTenant } from "@/db/client";
import { requireSession } from "@/server/guard";
import { oidcConfig } from "@/server/services";

export const dynamic = "force-dynamic";
const ROLES = ["viewer", "processor", "underwriter", "admin"];
const back = (o: Outcome) => redirect(`/admin/users?${o.ok ? "msg" : "err"}=${encodeURIComponent(o.message)}`);
async function ctx() {
  const s = await requireSession("admin", "/admin/users");
  return { s, c: { tenantId: s.tenantId, userId: s.userId! } };
}
const val = (f: FormData, k: string) => String(f.get(k) ?? "");

async function create(f: FormData): Promise<void> { "use server"; const { s, c } = await ctx(); return back(await createUser(s.sql, c, val(f, "email"), val(f, "role"))); }
async function changeRole(f: FormData): Promise<void> { "use server"; const { s, c } = await ctx(); return back(await setUserRole(s.sql, c, val(f, "userId"), val(f, "role"))); }
async function toggle(f: FormData): Promise<void> { "use server"; const { s, c } = await ctx(); return back(await setUserDisabled(s.sql, c, val(f, "userId"), val(f, "disable") === "1")); }
async function link(f: FormData): Promise<void> { "use server"; const { s, c } = await ctx(); return back(await linkIdentity(s.sql, c, val(f, "userId"), oidcConfig()?.issuer, val(f, "subject"))); }
async function unlink(f: FormData): Promise<void> { "use server"; const { s, c } = await ctx(); return back(await unlinkIdentity(s.sql, c, val(f, "userId"))); }
async function endSessions(f: FormData): Promise<void> { "use server"; const { s, c } = await ctx(); return back(await revokeUserSessions(s.sql, c, val(f, "userId"))); }

export default async function Users({ searchParams }: { searchParams: Promise<{ msg?: string; err?: string }> }) {
  const { s } = await ctx();
  const { msg, err } = await searchParams;
  const rows = await withTenant(s.sql, { tenantId: s.tenantId, userId: s.userId! }, (tx) => listUsers(tx));
  const hid = (id: string) => <input type="hidden" name="userId" value={id} />;
  return (
    <main>
      <p><Link href="/review">← Files</Link> · <Link href="/admin/audit">Security events</Link></p>
      <h1>Users and access</h1>
      <p>Roles decide what a person can do. Only an underwriter can record a decision. Sign-in itself is handled by the identity provider; link each person&apos;s provider identity here before they can sign in.</p>
      {msg && <p role="status">{msg}</p>}
      {err && <p role="alert" style={{ borderLeft: "4px solid var(--crit)", paddingLeft: 8 }}>{err}</p>}
      <table>
        <thead><tr><th>Email</th><th>Role</th><th>Status</th><th>Identity</th><th>Sessions</th><th>Actions</th></tr></thead>
        <tbody>
          {rows.map((u) => {
            const me = u.id === s.userId;
            return (
              <tr key={u.id}>
                <td>{u.email}{me ? " (you)" : ""}</td>
                <td>
                  {me ? u.role : (
                    <form action={changeRole} style={{ display: "flex", gap: 4 }}>{hid(u.id)}
                      <select name="role" defaultValue={u.role} aria-label={`Role for ${u.email}`}>{ROLES.map((r) => <option key={r}>{r}</option>)}</select>
                      <button>Set</button>
                    </form>)}
                </td>
                <td>{u.disabled ? "disabled" : "active"}</td>
                <td>
                  {u.subject ? <span title={u.issuer ?? ""}>{u.subject}</span> : me ? "none" : (
                    <form action={link} style={{ display: "flex", gap: 4 }}>{hid(u.id)}
                      <input name="subject" placeholder="provider subject id" aria-label={`Provider subject for ${u.email}`} required />
                      <button>Link</button>
                    </form>)}
                </td>
                <td>{u.sessions}{u.last_seen ? ` (last active ${u.last_seen.slice(0, 16)})` : ""}</td>
                <td>
                  {me ? null : (
                    <div style={{ display: "flex", gap: 4, flexWrap: "wrap" }}>
                      <form action={toggle}>{hid(u.id)}<input type="hidden" name="disable" value={u.disabled ? "0" : "1"} /><button>{u.disabled ? "Enable" : "Disable"}</button></form>
                      <form action={endSessions}>{hid(u.id)}<button>End sessions</button></form>
                      {u.subject ? <form action={unlink}>{hid(u.id)}<button>Unlink identity</button></form> : null}
                    </div>)}
                </td>
              </tr>);
          })}
        </tbody>
      </table>
      <h2>Add a user</h2>
      <form action={create} style={{ display: "grid", gap: 8, maxWidth: 420 }}>
        <label>Email <input name="email" type="email" required maxLength={254} /></label>
        <label>Role <select name="role" defaultValue="viewer">{ROLES.map((r) => <option key={r}>{r}</option>)}</select></label>
        <button type="submit">Create user</button>
      </form>
    </main>
  );
}
