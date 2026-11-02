import { AuthShell } from "../auth-shell";

export const dynamic = "force-dynamic";

/**
 * Where sign-out lands. It must not redirect anywhere: the page policy limits form-action to this site, and browsers apply that to every redirect that
 * follows a form submission, so a sign-out that bounced straight on to the identity provider would be blocked and leave a blank page.
 */
export default function SignedOut() {
  return (
    <AuthShell>
      <h1>You are signed out</h1>
      <p className="sub">Your session has ended on this device.</p>
      <a className="btn" href="/signin">Sign in again</a>
    </AuthShell>
  );
}
