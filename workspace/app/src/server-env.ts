import { z } from "zod";

const Env = z.object({
  DATABASE_URL: z.string().url(),
  /** LOCAL DEVELOPMENT ONLY. Real tenant identity comes from the verified session once authentication (D-011) exists. */
  DEV_TENANT_ID: z.string().uuid().optional(),
  DEV_USER_ID: z.string().uuid().optional(),
  FIELD_KEY_MASTER: z.string().min(44).optional(),
  UPLOAD_DIR: z.string().min(1).optional(),
  /** Where uploaded documents are kept: "local" (a directory, UPLOAD_DIR) or "postgres" (encrypted rows; for hosts with no writable disk and small pilots). */
  OBJECT_STORE: z.enum(["local", "postgres"]).default("local"),
  /** Connections per process. Use 1 on serverless hosts. */
  DB_POOL_MAX: z.coerce.number().int().min(1).max(20).default(5),
  /** Lets a TEST deployment run without a malware scanner. Never a substitute in a pilot with real documents; every page then shows a banner. */
  ALLOW_UNSCANNED_UPLOADS: z.literal("test-environment-only").optional(),
  /** Shared secret for the delivery worker route. The route is disabled when unset. */
  WORKER_SECRET: z.string().min(24).optional(),
  /** Bearer secret for /api/metrics. The route is disabled when unset. */
  METRICS_SECRET: z.string().min(24).optional(),
  /** "global": one identity provider for the deployment, from the OIDC_* settings. "per_tenant": each organization configures its own (D-030); needs APP_ORIGIN. */
  SSO_MODE: z.enum(["global", "per_tenant"]).default("global"),
  /** This application's public origin, for example https://app.example.com. The single callback https://app.example.com/api/auth/callback is registered with every provider. */
  APP_ORIGIN: z.string().url().optional(),
  /** OpenID Connect sign-in (D-011, D-029). When OIDC_ISSUER is set, every user route requires a session; the DEV_* identity is then ignored. */
  OIDC_ISSUER: z.string().url().optional(),
  OIDC_CLIENT_ID: z.string().min(1).optional(),
  OIDC_CLIENT_SECRET: z.string().min(16).optional(),
  /** Exact callback URL registered with the identity provider; its origin is also the application origin used for CSRF checks. */
  OIDC_REDIRECT_URI: z.string().url().optional(),
  /** Comma-separated authentication methods the ID token must report (amr), for example "mfa". Provider-specific; empty means not enforced here. */
  OIDC_REQUIRED_AMR: z.string().optional(),
  /** Reverse proxies in front of the app that append to X-Forwarded-For (1 on Vercel). 0 means the header is ignored and all callers share one rate limit. */
  TRUSTED_PROXY_HOPS: z.coerce.number().int().min(0).max(5).optional(),
  /** ClamAV daemon that scans every upload before it is stored. Required in production; uploads are refused while it cannot answer. */
  CLAMD_HOST: z.string().min(1).optional(),
  CLAMD_PORT: z.coerce.number().int().min(1).max(65535).default(3310),
  SESSION_IDLE_MINUTES: z.coerce.number().int().min(1).max(480).default(30),
  SESSION_ABSOLUTE_HOURS: z.coerce.number().int().min(1).max(72).default(12),
  /** "mock" reads printed labels and calls nothing outside the process. "anthropic" sends redacted document text to the Anthropic API (D-036). */
  LLM_PROVIDER: z.enum(["mock", "anthropic"]).default("mock"),
  /** Must be exactly "approved" for LLM_PROVIDER=anthropic. A person sets it after reviewing the provider's data terms; it is the code form of "no external call without approval". */
  LLM_EXTERNAL_CALLS: z.literal("approved").optional(),
  ANTHROPIC_API_KEY: z.string().min(20).optional(),
  LLM_MODEL: z.string().min(3).max(80).optional(),
  LLM_EFFORT: z.enum(["low", "medium", "high"]).default("low"),
  /** Server-side fallback when the provider's safety classifier declines a request. On by default. */
  LLM_FALLBACKS: z.enum(["on", "off"]).default("on"),
  LLM_TIMEOUT_MS: z.coerce.number().int().min(5_000).max(300_000).default(80_000),
  WEBHOOK_URL: z.string().url().optional(),
  WEBHOOK_SECRET: z.string().min(16).optional(),
});

export function serverEnv() {
  const parsed = Env.safeParse(process.env);
  if (!parsed.success) throw new Error("invalid server environment: " + parsed.error.issues.map((i) => i.path.join(".")).join(", "));
  const d = parsed.data;
  if (d.SSO_MODE === "per_tenant" && !d.APP_ORIGIN) throw new Error("APP_ORIGIN is required when SSO_MODE is per_tenant");
  if (d.LLM_PROVIDER === "anthropic") {
    if (!d.ANTHROPIC_API_KEY) throw new Error("ANTHROPIC_API_KEY is required when LLM_PROVIDER is anthropic");
    if (d.LLM_EXTERNAL_CALLS !== "approved") throw new Error("LLM_PROVIDER=anthropic sends document text to an external service; set LLM_EXTERNAL_CALLS=approved only after the provider's data terms were reviewed and approved");
  }
  if (process.env["NODE_ENV"] === "production") {
    if (d.DEV_TENANT_ID || d.DEV_USER_ID) throw new Error("DEV_TENANT_ID must not be set in production");
    if (!d.CLAMD_HOST && !d.ALLOW_UNSCANNED_UPLOADS) throw new Error("CLAMD_HOST is required in production: uploads must be malware-scanned (a test deployment may set ALLOW_UNSCANNED_UPLOADS=test-environment-only)");
    if (d.TRUSTED_PROXY_HOPS === undefined) throw new Error("TRUSTED_PROXY_HOPS must be set explicitly in production (1 on Vercel; 0 if there is no proxy, which makes all callers share one rate limit)");
    if (d.SSO_MODE === "per_tenant") {
      if (!d.APP_ORIGIN!.startsWith("https://")) throw new Error("APP_ORIGIN must be https in production");
    } else {
      if (!d.OIDC_ISSUER || !d.OIDC_CLIENT_ID || !d.OIDC_REDIRECT_URI) throw new Error("OIDC_ISSUER, OIDC_CLIENT_ID and OIDC_REDIRECT_URI are required in production");
      if (!d.OIDC_CLIENT_SECRET) throw new Error("OIDC_CLIENT_SECRET is required in production");
      if (!d.OIDC_ISSUER.startsWith("https://") || !d.OIDC_REDIRECT_URI.startsWith("https://")) throw new Error("OIDC URLs must be https in production");
    }
    const db = new URL(parsed.data.DATABASE_URL);
    // ASVS V12.3.1: no unencrypted database connection in production; V13.2.3: no documented local-development credentials
    if (!["require", "verify-ca", "verify-full"].includes(db.searchParams.get("sslmode") ?? "")) throw new Error("DATABASE_URL must set sslmode=require (or stricter) in production");
    if (/_dev$/.test(decodeURIComponent(db.password)) || ["postgres", "password", ""].includes(decodeURIComponent(db.password))) throw new Error("DATABASE_URL uses a development credential in production");
  }
  return parsed.data;
}
