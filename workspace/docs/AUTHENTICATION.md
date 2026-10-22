# Authentication and authorization design

Status 2026-10-22: built and tested against a local fake identity provider. No real provider has been chosen or evaluated (B-117). Decision D-029.

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

## Roles
`viewer` reads; `processor` also takes applications and builds files; `underwriter` records decisions (the database decision gate independently requires an underwriter acting as themselves); `admin` administers users and identities and may run delivery. Every API route declares the role it needs and a policy test fails if one does not (hardening.test.ts). Pages and server actions use the same check.

## Provisioning
Identities are not created at first login. A tenant admin (or the owner role during setup) links an IdP subject to an existing user: `auth.link_identity`. One subject maps to one user; one user has one identity per issuer. Disabling a user (`auth.set_user_disabled`) revokes their sessions and blocks new ones. There is no administration screen yet (B-148).

## Local development
`app/test/support/fakeIdp.ts` is a development-only provider (it refuses to run when NODE_ENV is production). `scripts/demo-up.sh` starts it so the demo signs in as Admin, Processor, Underwriter or Viewer. Without `OIDC_ISSUER`, non-production runs can still use the legacy `DEV_TENANT_ID` identity; production refuses to start without OIDC settings and refuses `DEV_*` variables.

## Configuration
`OIDC_ISSUER`, `OIDC_CLIENT_ID`, `OIDC_CLIENT_SECRET`, `OIDC_REDIRECT_URI` (all required in production, https only), `OIDC_REQUIRED_AMR` (optional), `SESSION_IDLE_MINUTES` (default 30), `SESSION_ABSOLUTE_HOURS` (default 12).

## Checklist for choosing a real provider (B-117)
Authorization code with PKCE and exact redirect matching; asymmetric ID token signatures (RS256, PS256 or ES256) and a discovery document; MFA enforcement and whether it reports `amr`; passwordless or phishing-resistant options; SSO to a lender's own IdP (per-tenant issuers are not supported yet, B-152); organization or tenant model; admin audit log; session and token lifetimes; SCIM or API deprovisioning; data residency and subprocessors; SOC 2 report scope; availability SLA; price. None of these has been verified for any provider.

## Residual risks
- The application server is trusted to assert the acting user inside a transaction; a compromised application can act as any user. Database role separation limits what it can do (no direct access to sessions or identities) but not this.
- A single IdP is configured per deployment (B-152).
- Authorization codes appear in the callback URL and may be logged by the platform; they are single-use, PKCE-bound and short-lived.
- No administration screen, no session list for users, no purge job for expired sessions (B-148, B-150).
- `amr` semantics differ by provider; MFA enforcement through it is only as good as the provider's reporting.
- Not independently tested.
