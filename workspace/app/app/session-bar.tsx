import { oidcConfig, services } from "@/server/services";

/** Shows who is signed in and a sign-out button. Renders nothing when sign-in is not configured or there is no session. */
export async function SessionBar() {
  let who: { role: string } | null = null;
  try {
    if (!oidcConfig()) return null;
    const s = await services();
    who = s?.role ? { role: s.role } : null;
  } catch {
    return null; // build-time or misconfigured environment: never fail the page because of the bar
  }
  if (!who) return null;
  return (
    <form action="/api/auth/logout" method="post" style={{ display: "flex", gap: 12, justifyContent: "flex-end", alignItems: "center", marginBottom: 8 }}>
      <span>Signed in ({who.role})</span>
      <button type="submit">Sign out</button>
    </form>
  );
}
