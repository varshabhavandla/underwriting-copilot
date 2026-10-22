import { safeReturnTo } from "@/auth/flow";
import { authMode } from "@/server/services";

export const dynamic = "force-dynamic";

/** Where anonymous visitors start. Public by design: it shows no data. */
export default async function SignIn({ searchParams }: { searchParams: Promise<{ returnTo?: string; org?: string }> }) {
  const { returnTo, org } = await searchParams;
  const mode = authMode();
  const back = safeReturnTo(returnTo);
  return (
    <main>
      <h1>Sign in</h1>
      {mode === "per_tenant" ? (
        <form action="/signin/continue" method="get" style={{ display: "grid", gap: 8, maxWidth: 420 }}>
          <label>Organization <input name="org" defaultValue={org ?? ""} required maxLength={40} autoComplete="organization" placeholder="for example first-community-bank" /></label>
          <input type="hidden" name="returnTo" value={back} />
          <button type="submit">Continue</button>
          <p>You will be sent to your organization&apos;s own sign-in page.</p>
        </form>
      ) : mode === "global" ? (
        <p><a href={`/api/auth/login?returnTo=${encodeURIComponent(back)}`}>Continue to sign in</a></p>
      ) : (
        <p>Sign-in is not configured in this environment.</p>
      )}
    </main>
  );
}
