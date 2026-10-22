import Link from "next/link";
import { oidcConfig, services } from "@/server/services";

/** Navigation, who is signed in, and sign-out. Renders nothing when sign-in is not configured or there is no session. */
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
    <nav style={{ display: "flex", gap: 12, justifyContent: "flex-end", alignItems: "center", marginBottom: 8, flexWrap: "wrap" }}>
      <Link href="/review">Files</Link>
      {who.role === "admin" ? <Link href="/admin/users">Admin</Link> : null}
      <Link href="/account">Your sessions</Link>
      <span>Signed in ({who.role})</span>
      <form action="/api/auth/logout" method="post"><button type="submit">Sign out</button></form>
    </nav>
  );
}
