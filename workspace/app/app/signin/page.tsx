import { safeReturnTo } from "@/auth/flow";
import { authMode } from "@/server/services";
import { AuthShell } from "../auth-shell";

export const dynamic = "force-dynamic";

/** Where anonymous visitors start. Public by design: it shows no data. */
export default async function SignIn({ searchParams }: { searchParams: Promise<{ returnTo?: string; org?: string }> }) {
  const { returnTo, org } = await searchParams;
  const mode = authMode();
  const back = safeReturnTo(returnTo);
  return (
    <AuthShell>
      <h1>Sign in</h1>
      <p className="sub">Welcome back. Sign in to review your files.</p>
      {mode === "per_tenant" ? (
        <form action="/signin/continue" method="get" style={{ display: "grid", gap: 8, maxWidth: 420 }}>
          <label>Organization <input name="org" defaultValue={org ?? ""} required maxLength={40} autoComplete="organization" placeholder="for example first-community-bank" /></label>
          <input type="hidden" name="returnTo" value={back} />
          <button type="submit">Continue</button>
          <p className="note">You will be sent to your organization&apos;s own sign-in page.</p>
        </form>
      ) : mode === "global" ? (
        <>
          <a className="btn" href={`/api/auth/login?returnTo=${encodeURIComponent(back)}`}>Continue to sign in</a>
          <p className="note">You will be sent to your identity provider to sign in securely.</p>
        </>
      ) : (
        <p>Sign-in is not configured in this environment.</p>
      )}
    </AuthShell>
  );
}
