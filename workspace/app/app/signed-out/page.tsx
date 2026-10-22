import { authMode } from "@/server/services";

export const dynamic = "force-dynamic";

/**
 * Where sign-out lands. It must not redirect anywhere: the page policy limits form-action to this site, and browsers apply that to every redirect that
 * follows a form submission, so a sign-out that bounced straight on to the identity provider would be blocked and leave a blank page.
 */
export default function SignedOut() {
  const href = authMode() === "per_tenant" ? "/signin" : "/api/auth/login?returnTo=%2Freview";
  return (
    <main>
      <h1>You are signed out</h1>
      <p>Your session has ended on this device. <a href={href}>Sign in again</a></p>
    </main>
  );
}
