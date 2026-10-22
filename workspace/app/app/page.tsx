import { redirect } from "next/navigation";
import { requireSession } from "@/server/guard";

export const dynamic = "force-dynamic";

/** The review queue is the home page; anonymous visitors are sent to sign-in first. */
export default async function Home() {
  await requireSession("view", "/review");
  redirect("/review");
}
