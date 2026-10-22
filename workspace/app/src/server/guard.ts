import { redirect } from "next/navigation";
import { can, type Action } from "../auth/roles";
import { services, type Services } from "./services";

/** For pages and server actions: sends anonymous visitors to sign-in (returning them here) and refuses roles that may not do this. */
export async function requireSession(action: Action, returnTo: string): Promise<Services> {
  const s = await services();
  if (!s) redirect(`/api/auth/login?returnTo=${encodeURIComponent(returnTo)}`);
  if (!can(s.role, action)) redirect("/forbidden");
  return s;
}

/** For JSON routes: a response to return instead of continuing, or null when the caller may proceed. */
export function deny(s: Services | null, action: Action): Response | null {
  if (!s) return Response.json({ error: "unauthenticated" }, { status: 401 });
  if (!can(s.role, action)) return Response.json({ error: "forbidden" }, { status: 403 });
  return null;
}
