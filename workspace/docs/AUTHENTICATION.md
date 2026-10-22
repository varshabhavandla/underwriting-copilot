# Authentication and authorization design

Status 2026-10-22: built and tested against local fake identity providers. No real provider has been chosen or evaluated (B-117). Decisions D-029 (OpenID Connect client, database-enforced sessions) and D-030 (per-organization sign-in).

## Principles
1. We do not store passwords or run MFA. The identity provider (IdP) authenticates the person; we decide whether to trust its assertion and map it to a user a lender administrator provisioned.
2. Who someone is in our system (tenant, role, disabled state) comes from our database, never from token claims.
3. Sessions are server-side state we can revoke at once; the browser holds only an opaque random token.
4. The database enforces session rules. The application role cannot read or write identity or session tables; it can only call a small set of SECURITY DEFINER functions (migration 0007).

## Flow (OpenID Connect authorization code with PKCE) [standards read: OIDC Core 1.0 section 3.1.3.7 and RFC 9700, S-53, S-54]
1. `GET /api/auth/login?returnTo=/path`: discovery document fetched (issuer must equal the configured issuer; endpoints must be https, loopback http allowed only outside production); random state, nonce and PKCE verifier created; sealed into a 10-minute AES-256-GCM cookie `__Host-uw_oidc`; redirect to the IdP with `code_challenge_method=S256`.
2. IdP authenticates the user and redirects to `/api/auth/callback?code&state`.
3. Callback: the flow cookie must open and be unexpired; state must match; the code is exchanged at the token endpoint with the verifier (and client secret); the ID token is verified: signature against the IdP's published keys, algorithms limited to RS256, PS256 and ES256, issuer, audience, authorized party, expiry, issued-at age of at most 10 minutes with 60 seconds of leeway, nonce, and any required `amr` (for example `mfa`, configured with `OIDC_REQUIRED_AMR`).
4. `auth.login(issuer, subject, token_hash, lifetime)` looks up the pre-provisioned identity. Unknown or disabled: refused with a generic page and a logged reason code. Known: a session row is created holding only the SHA-256 of a 256-bit random token; the cookie `__Host-uw_session` (Secure, HttpOnly, SameSite=Lax, Path=/, no Domain) is set; the flow cookie is cleared; an `auth.login` audit event is written in the tenant's ledger.
5. Every request: `auth.resolve_session` checks the token hash, revocation, absolute lifetime (default 12 hours), inactivity (default 30 minutes) and that the user is still enabled, and returns tenant, user and role.
6. `POST /api/auth/logout`: Origin must equal the application origin; session revoked; `auth.logout` audited; cookie cleared; `Clear-Site-Data` for cache and storage.

## Per-organization sign-in (SSO_MODE=per_tenant, D-030)
A lender normally signs in through its own identity provider. In this mode each organization has its own provider and the deployment has none.
- **Provisioning (operator).** `scripts/provision-tenant.ts` (database owner role) creates an organization, its sign-in name (for example `first-community-bank`), optionally its provider, and its first admin. Tenant admins cannot create or change the name, so one organization cannot claim another's; names are unique.
- **Configuration (tenant admin).** `/admin/sso` shows the callback URL to register at the provider (one URL for all organizations: `APP_ORIGIN/api/auth/callback`), and takes the issuer, client id, client secret (write-only, encrypted under the tenant's key, never displayed or returned), required authentication methods, and an enable switch. A test button checks the provider's discovery document through the guarded client. One provider belongs to one organization.
- **Sign-in.** People open `/signin`, type the organization name, and are sent to that organization's provider. The organization is bound into the sealed flow cookie; the callback uses that organization's settings (never anything from the request), the ID token must satisfy that provider, and `auth.login` refuses to create a session for any other organization. An unknown, disabled or incomplete organization gets the same generic page, so names cannot be probed.
- **Identities** can be linked only to the organization's own provider once one is configured, and are unique per issuer and subject. The same subject value at two organizations' providers belongs to two different people.
- **Outbound requests** to administrator-supplied provider URLs (discovery, token, keys) go through `src/auth/safeFetch.ts`: https only, default port, no credentials in the URL, every resolved address must be public (private ranges, loopback, link-local and cloud metadata are refused), no redirects, 256 KB response cap, 5-second timeout. Provider keys are cached for an hour; an unknown key id triggers at most one refetch per 30 seconds.
- **Form submissions.** The page policy limits `form-action` to this site and browsers apply that to the redirect that follows a form, so the sign-in form goes through a same-site hop (`/signin/continue`, a meta refresh) instead of redirecting straight to the provider. Browser tests found this.
- **Production** requires `SSO_MODE=per_tenant` with an https `APP_ORIGIN`, or the single deployment-wide provider settings; it refuses the development identity either way.

## Roles
`viewer` reads; `processor` also takes applications and builds files; `underwriter` records decisions (the database decision gate independently requires an underwriter acting as themselves); `admin` administers users and identities and may run delivery. Every API route declares the role it needs and a policy test fails if one does not (hardening.test.ts). Pages and server actions use the same check.

## Provisioning and administration
Identities are not created at first login. Admins use the screens under `/admin/users` (admin role only): create a user with a role, link the person's provider subject identifier, change a role (effective on the very next request), disable or enable (sessions end at once), end a user's sessions, unlink an identity. `/admin/audit` lists sign-in, session and administration events from the tamper-evident ledger. Every user can open `/account` to see their own sessions (browser, times) and end any of them.
These are database functions, not application logic: each requires an acting admin in the same tenant, audits itself (ids and counts only, never email addresses or tokens), and the application role no longer has INSERT on users. An admin cannot change their own role, disable themselves or unlink their own identity, so a tenant always keeps at least one enabled admin. One subject maps to one user; one user has one identity per issuer. The first admin of a tenant is created by whoever provisions the tenant with the owner database role (a setup step, not a screen).

## Local development
`app/test/support/fakeIdp.ts` is a development-only provider (it refuses to run when NODE_ENV is production). `scripts/demo-up.sh` starts it so the demo signs in as Admin, Processor, Underwriter or Viewer. Without `OIDC_ISSUER`, non-production runs can still use the legacy `DEV_TENANT_ID` identity; production refuses to start without OIDC settings and refuses `DEV_*` variables.

## Configuration
`OIDC_ISSUER`, `OIDC_CLIENT_ID`, `OIDC_CLIENT_SECRET`, `OIDC_REDIRECT_URI` (all required in production, https only), `OIDC_REQUIRED_AMR` (optional), `SESSION_IDLE_MINUTES` (default 30), `SESSION_ABSOLUTE_HOURS` (default 12).

## Checklist for choosing a real provider (B-117)
Authorization code with PKCE and exact redirect matching; asymmetric ID token signatures (RS256, PS256 or ES256) and a discovery document; MFA enforcement and whether it reports `amr`; passwordless or phishing-resistant options; SSO to a lender's own IdP (per-organization issuers are supported, D-030); organization or tenant model; admin audit log; session and token lifetimes; SCIM or API deprovisioning; data residency and subprocessors; SOC 2 report scope; availability SLA; price. None of these has been verified for any provider.

## Residual risks
- The application server is trusted to assert the acting user inside a transaction; a compromised application can act as any user. Database role separation limits what it can do (no direct access to sessions or identities) but not this.
- A malicious or compromised organization administrator can point their own organization at a provider they control; that affects only their own organization (identities, sessions and settings are organization-scoped), but it means the organization's admins are trusted with its sign-in. Provider URLs are checked against private addresses when used, and the connection itself is pinned to the validated addresses, so DNS rebinding cannot redirect it; network-level egress restrictions are still advised as defense in depth (B-153).
- Authorization codes appear in the callback URL and may be logged by the platform; they are single-use, PKCE-bound and short-lived.
- No purge job for expired and revoked sessions (B-150); no bulk user import or SCIM deprovisioning; the administration screens have had no usability review.
- `amr` semantics differ by provider; MFA enforcement through it is only as good as the provider's reporting.
- Not independently tested.
- Enabling single sign-on or changing the issuer does not end existing sessions (changing the issuer only blocks new sign-ins until identities are relinked); admins end sessions explicitly.
- Each organization has one provider; two providers (for example during a migration) are not supported.
