import { safeReturnTo } from "@/auth/flow";
import { isSlug } from "@/auth/idp";

export const dynamic = "force-dynamic";

/**
 * A same-site hop between the sign-in form and the login route. The page's Content-Security-Policy limits form-action to this site, and browsers apply
 * that limit to every redirect that follows a form submission, so a form cannot lead straight to the organization's identity provider. A meta refresh is
 * a new navigation, not part of the form submission, and needs no script.
 */
export default async function Continue({ searchParams }: { searchParams: Promise<{ org?: string; returnTo?: string }> }) {
  const { org, returnTo } = await searchParams;
  const slug = (org ?? "").trim().toLowerCase();
  const target = `/api/auth/login?org=${encodeURIComponent(isSlug(slug) ? slug : "")}&returnTo=${encodeURIComponent(safeReturnTo(returnTo))}`;
  return (
    <main>
      <meta httpEquiv="refresh" content={`0;url=${target}`} />
      <h1>Taking you to your organization&apos;s sign-in</h1>
      <p><a href={target}>Continue</a> if you are not redirected.</p>
    </main>
  );
}
