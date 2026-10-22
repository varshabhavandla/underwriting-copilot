import { z } from "zod";

const Env = z.object({
  DATABASE_URL: z.string().url(),
  /** LOCAL DEVELOPMENT ONLY. Real tenant identity comes from the verified session once authentication (D-011) exists. */
  DEV_TENANT_ID: z.string().uuid().optional(),
  DEV_USER_ID: z.string().uuid().optional(),
  FIELD_KEY_MASTER: z.string().min(44).optional(),
  UPLOAD_DIR: z.string().min(1).optional(),
  /** Shared secret for the delivery worker route. The route is disabled when unset. */
  WORKER_SECRET: z.string().min(24).optional(),
  /** Bearer secret for /api/metrics. The route is disabled when unset. */
  METRICS_SECRET: z.string().min(24).optional(),
  WEBHOOK_URL: z.string().url().optional(),
  WEBHOOK_SECRET: z.string().min(16).optional(),
});

export function serverEnv() {
  const parsed = Env.safeParse(process.env);
  if (!parsed.success) throw new Error("invalid server environment: " + parsed.error.issues.map((i) => i.path.join(".")).join(", "));
  if (process.env["NODE_ENV"] === "production") {
    if (parsed.data.DEV_TENANT_ID || parsed.data.DEV_USER_ID) throw new Error("DEV_TENANT_ID must not be set in production");
    const db = new URL(parsed.data.DATABASE_URL);
    // ASVS V12.3.1: no unencrypted database connection in production; V13.2.3: no documented local-development credentials
    if (!["require", "verify-ca", "verify-full"].includes(db.searchParams.get("sslmode") ?? "")) throw new Error("DATABASE_URL must set sslmode=require (or stricter) in production");
    if (/_dev$/.test(decodeURIComponent(db.password)) || ["postgres", "password", ""].includes(decodeURIComponent(db.password))) throw new Error("DATABASE_URL uses a development credential in production");
  }
  return parsed.data;
}
