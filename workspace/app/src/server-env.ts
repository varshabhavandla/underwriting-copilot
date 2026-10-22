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
  /** OpenID Connect sign-in (D-011, D-029). When OIDC_ISSUER is set, every user route requires a session; the DEV_* identity is then ignored. */
  OIDC_ISSUER: z.string().url().optional(),
  OIDC_CLIENT_ID: z.string().min(1).optional(),
  OIDC_CLIENT_SECRET: z.string().min(16).optional(),
  /** Exact callback URL registered with the identity provider; its origin is also the application origin used for CSRF checks. */
  OIDC_REDIRECT_URI: z.string().url().optional(),
  /** Comma-separated authentication methods the ID token must report (amr), for example "mfa". Provider-specific; empty means not enforced here. */
  OIDC_REQUIRED_AMR: z.string().optional(),
  SESSION_IDLE_MINUTES: z.coerce.number().int().min(1).max(480).default(30),
  SESSION_ABSOLUTE_HOURS: z.coerce.number().int().min(1).max(72).default(12),
  WEBHOOK_URL: z.string().url().optional(),
  WEBHOOK_SECRET: z.string().min(16).optional(),
});

export function serverEnv() {
  const parsed = Env.safeParse(process.env);
  if (!parsed.success) throw new Error("invalid server environment: " + parsed.error.issues.map((i) => i.path.join(".")).join(", "));
  if (process.env["NODE_ENV"] === "production") {
    if (parsed.data.DEV_TENANT_ID || parsed.data.DEV_USER_ID) throw new Error("DEV_TENANT_ID must not be set in production");
    const d = parsed.data;
    if (!d.OIDC_ISSUER || !d.OIDC_CLIENT_ID || !d.OIDC_REDIRECT_URI) throw new Error("OIDC_ISSUER, OIDC_CLIENT_ID and OIDC_REDIRECT_URI are required in production");
    if (!d.OIDC_CLIENT_SECRET) throw new Error("OIDC_CLIENT_SECRET is required in production");
    if (!d.OIDC_ISSUER.startsWith("https://") || !d.OIDC_REDIRECT_URI.startsWith("https://")) throw new Error("OIDC URLs must be https in production");
    const db = new URL(parsed.data.DATABASE_URL);
    // ASVS V12.3.1: no unencrypted database connection in production; V13.2.3: no documented local-development credentials
    if (!["require", "verify-ca", "verify-full"].includes(db.searchParams.get("sslmode") ?? "")) throw new Error("DATABASE_URL must set sslmode=require (or stricter) in production");
    if (/_dev$/.test(decodeURIComponent(db.password)) || ["postgres", "password", ""].includes(decodeURIComponent(db.password))) throw new Error("DATABASE_URL uses a development credential in production");
  }
  return parsed.data;
}
