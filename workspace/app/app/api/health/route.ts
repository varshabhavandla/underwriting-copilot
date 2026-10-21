export const dynamic = "force-dynamic";

/** Liveness only: no data, no database call, safe to expose. */
export function GET(): Response {
  return Response.json({ status: "ok" });
}
