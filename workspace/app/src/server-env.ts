import { z } from "zod";

const Env = z.object({
  DATABASE_URL: z.string().url(),
  /** LOCAL DEVELOPMENT ONLY. Real tenant identity comes from the verified session once authentication (D-011) exists. */
  DEV_TENANT_ID: z.string().uuid().optional(),
});

export function serverEnv() {
  const parsed = Env.safeParse(process.env);
  if (!parsed.success) throw new Error("invalid server environment: " + parsed.error.issues.map((i) => i.path.join(".")).join(", "));
  if (process.env["NODE_ENV"] === "production" && parsed.data.DEV_TENANT_ID) {
    throw new Error("DEV_TENANT_ID must not be set in production");
  }
  return parsed.data;
}
