import Link from "next/link";
import { redirect } from "next/navigation";
import type { Outcome } from "@/admin/actions";
import { configureIdp, getMyIdp, testIdp } from "@/admin/sso";
import { requireSession } from "@/server/guard";
import { authMode, callbackUri } from "@/server/services";

export const dynamic = "force-dynamic";
const back = (o: Outcome) => redirect(`/admin/sso?${o.ok ? "msg" : "err"}=${encodeURIComponent(o.message)}`);
const val = (f: FormData, k: string) => String(f.get(k) ?? "");

async function save(f: FormData): Promise<void> {
  "use server";
  const s = await requireSession("admin", "/admin/sso");
  return back(await configureIdp(s.sql, s.keys, { tenantId: s.tenantId, userId: s.userId! }, {
    issuer: val(f, "issuer"), clientId: val(f, "clientId"), clientSecret: val(f, "clientSecret"), requiredAmr: val(f, "requiredAmr"), enabled: f.get("enabled") === "on",
  }));
}
async function test(f: FormData): Promise<void> {
  "use server";
  await requireSession("admin", "/admin/sso");
  return back(await testIdp({ issuer: val(f, "issuer").trim().replace(/\/+$/, "") }));
}

export default async function Sso({ searchParams }: { searchParams: Promise<{ msg?: string; err?: string }> }) {
  const s = await requireSession("admin", "/admin/sso");
  const { msg, err } = await searchParams;
  if (authMode() !== "per_tenant") return <main><p><Link href="/admin/users">← Users and access</Link></p><h1>Single sign-on</h1><p>This deployment uses one identity provider for everyone, so there is nothing to configure per organization.</p></main>;
  const idp = await getMyIdp(s.sql, { tenantId: s.tenantId, userId: s.userId! });
  return (
    <main>
      <p><Link href="/admin/users">← Users and access</Link></p>
      <h1>Single sign-on</h1>
      {msg && <p role="status">{msg}</p>}
      {err && <p role="alert" style={{ borderLeft: "4px solid var(--crit)", paddingLeft: 8 }}>{err}</p>}
      {!idp ? <p>Single sign-on has not been provisioned for this organization. Ask the operator of this service to set it up.</p> : (
        <>
          <p>Your people sign in at <code>/signin</code> by typing the organization name <strong>{idp.slug}</strong>. Status: <strong>{idp.enabled ? "enabled" : "disabled"}</strong>.</p>
          <p>Register this exact callback URL with your identity provider: <code>{callbackUri()}</code></p>
          <p>Your provider must support the authorization code flow with PKCE and sign ID tokens with RS256, PS256 or ES256. Link each person&apos;s provider identity on the Users screen after saving.</p>
          <form action={save} style={{ display: "grid", gap: 8, maxWidth: 560 }}>
            <label>Issuer URL <input name="issuer" defaultValue={idp.issuer ?? ""} required placeholder="https://login.example.com" /></label>
            <label>Client id <input name="clientId" defaultValue={idp.client_id ?? ""} required autoComplete="off" /></label>
            <label>Client secret {idp.has_secret ? "(saved; leave blank to keep it)" : "(required)"} <input name="clientSecret" type="password" autoComplete="new-password" required={!idp.has_secret} /></label>
            <label>Required authentication methods (comma separated, for example mfa) <input name="requiredAmr" defaultValue={idp.required_amr.join(",")} /></label>
            <label style={{ display: "flex", gap: 8, alignItems: "center" }}><input name="enabled" type="checkbox" defaultChecked={idp.enabled} /> Enable single sign-on</label>
            <button type="submit">Save</button>
          </form>
          {idp.issuer ? <form action={test} style={{ marginTop: 12 }}><input type="hidden" name="issuer" value={idp.issuer} /><button type="submit">Test the provider</button></form> : null}
        </>)}
    </main>
  );
}
