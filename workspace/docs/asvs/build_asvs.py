"""Builds docs/asvs/ASVS_5.0.0_L2_assessment.csv and docs/ASVS_SELF_ASSESSMENT.md.
Usage: python3 build_asvs.py <path to OWASP_Application_Security_Verification_Standard_5.0.0_en.csv>
Requirement text (first 140 characters) is from OWASP ASVS 5.0.0, CC BY-SA 4.0, https://github.com/OWASP/ASVS. Statuses and evidence are ours.
"""
import csv, sys, collections, pathlib

T = "test/unit/asvs.test.ts"; H = "test/unit/hardening.test.ts"
M, P, N, D, X, U = "MET", "PARTIAL", "NOT_MET", "DEFERRED", "NA", "NOT_ASSESSED"
A = {}  # req_id -> (status, evidence)
def s(ids, st, ev):
    for i in ids.split(): A[i] = (st, ev)

# V1
s("V1.1.1", U, "Not reviewed for custom decoding steps")
s("V1.1.2 V1.2.1 V1.2.3", M, f"React output escaping, Response.json; {T} forbids raw HTML injection")
s("V1.2.2", M, "Internal links use validated UUIDs; webhook URL validation in src/servicing/webhook.ts")
s("V1.2.4", M, f"postgres.js parameterized queries; {T}: raw SQL only in src/db/migrate.ts (static migration files)")
s("V1.2.5 V1.3.2", M, f"{T}: no OS calls, no eval or Function")
s("V1.2.6 V1.2.7 V1.2.8 V1.3.1 V1.3.5 V1.3.7 V1.3.8 V1.3.9 V1.3.10 V1.3.11 V1.4.1 V1.4.3 V1.5.1", X, "Technology not used (no LDAP, XPath, LaTeX, WYSIWYG, templating, JNDI, memcache, mail, XML) or memory-managed runtime")
s("V1.4.2", X, "JavaScript runtime; money handled as integer cents (src/money.ts)")
s("V1.2.9", P, "One RegExp built from internal labels in src/llm/mockProvider.ts (mock only); no escaping applied")
s("V1.3.3", P, "zod length and character limits and database constraints; no per-context sanitizer review")
s("V1.3.4", P, "Text uploads (any UTF-8) are accepted, which could be SVG or HTML; files are never served back, B-129 viewer must serve as attachment with nosniff")
s("V1.3.6", P, "Webhook URL check blocks private IP literals and metadata host; DNS rebinding not handled (documented in webhook.ts)")
s("V1.5.2", M, "JSON.parse plus zod schemas; no native object deserialization")
# V2
s("V2.1.1 V2.1.2 V2.1.3", P, "Rules exist as code (src/application/schema.ts, docs/RULE_PACK.md); no single validation-rules document yet")
s("V2.2.1 V2.2.2 V2.2.3", M, "Server-side zod allowlists and enums, database check constraints, rule pack consistency checks")
s("V2.3.1", M, "Case status machine and decision gate enforced in the database (test/db/review.test.ts)")
s("V2.3.2", P, "Limits exist (4 MB uploads, gateway budgets, rate limits) but are not documented together")
s("V2.3.3", M, "withTenant runs each operation in one transaction (src/db/client.ts)")
s("V2.3.4", X, "No limited-quantity resources")
s("V2.4.1", P, f"Per-route rate limits ({H}); in-process only, per instance")
# V3
s("V3.2.1 V3.4.4", M, "nosniff on all responses; API responses default-src none; correct content types (next.config.ts; e2e header check)")
s("V3.2.2", M, "React renders text; no raw HTML injection (asvs.test.ts)")
s("V3.3.1 V3.3.2 V3.3.3 V3.3.4", D, "No cookies are set today; re-assess when authentication (B-117) adds session cookies")
s("V3.4.1", M, "Strict-Transport-Security max-age 63072000 includeSubDomains on all responses (next.config.ts)")
s("V3.4.2", M, "No CORS headers are set, so cross-origin reads are denied by default")
s("V3.4.3", P, "API: default-src none. Pages: frame-ancestors, base-uri, form-action, object-src only; nonce-based script policy is B-133")
s("V3.4.5", M, "Referrer-Policy same-origin (no-referrer breaks form posts, hardening.test.ts)")
s("V3.4.6", M, "frame-ancestors none on all responses")
s("V3.5.1", P, "Next server actions check Origin; JSON routes require application/json; no cookie auth yet. Re-assess with sessions")
s("V3.5.2", P, "JSON-only POST routes force a CORS preflight; re-verify once credentials are cookies")
s("V3.5.3", M, "State changes use POST; GET routes are read-only")
s("V3.5.4 V3.5.5", X, "Single application; no postMessage use")
s("V3.7.1", M, "Current React and Next.js only; no plugins")
s("V3.7.2", M, "redirect() calls target internal paths only")
# V4
s("V4.1.1", M, "Response.json and Next page responses carry content types")
s("V4.1.2 V4.2.1", D, "Host-level (TLS termination, HTTP parsing); depends on the hosting choice (D-026)")
s("V4.1.3", P, "Rate-limit key trusts X-Forwarded-For (src/http/withRequest.ts); safe only behind a proxy that overwrites it; backlog B-144")
s("V4.3.1 V4.3.2 V4.4.1 V4.4.2 V4.4.3 V4.4.4", X, "No GraphQL or WebSocket")
# V5
s("V5.1.1", P, "Allowed types and 4 MB limit are in code (src/storage/validateUpload.ts) and README; no per-upload-feature document")
s("V5.2.1", M, "4 MB cap in validateUpload plus request body cap")
s("V5.2.2", P, "Type decided by content (pdf, png, jpeg, text); file extension is not compared")
s("V5.2.3", X, "Archives and office formats are rejected by content detection")
s("V5.3.1 V5.3.2", M, "Objects stored encrypted under keys built only from tenant, case and hash (src/storage/objectStore.ts)")
s("V5.4.1 V5.4.2", X, "No file download endpoint yet; revisit with the source-document viewer (B-129)")
s("V5.4.3", N, "No antivirus or malware scanning of uploads")
# V6, V7, V9, V10
s("V6.3.2", M, "No default accounts; development identity is environment-only and refused in production (src/server-env.ts)")
s("V6.4.2", X, "No knowledge-based authentication")
D_IDS = ("V6.1.1 V6.1.2 V6.1.3 V6.2.1 V6.2.2 V6.2.3 V6.2.4 V6.2.5 V6.2.6 V6.2.7 V6.2.8 V6.2.9 V6.2.10 V6.2.11 V6.2.12 V6.3.1 V6.3.3 V6.3.4 V6.4.1 V6.4.3 V6.4.4 "
         "V6.5.1 V6.5.2 V6.5.3 V6.5.4 V6.5.5 V6.6.1 V6.6.2 V6.6.3 V6.8.1 V6.8.2 V6.8.3 V6.8.4")
s(D_IDS, D, "Authentication is not built; to be met by the chosen provider and our integration (B-117)")
s("V7.1.1 V7.1.2 V7.1.3 V7.2.1 V7.2.2 V7.2.3 V7.2.4 V7.3.1 V7.3.2 V7.4.1 V7.4.2 V7.4.3 V7.4.4 V7.4.5 V7.5.1 V7.5.2 V7.6.1 V7.6.2", D, "No sessions yet; depends on authentication (B-117)")
s("V9.1.1 V9.1.2 V9.1.3 V9.2.1 V9.2.2 V9.2.3 V9.2.4", D, "No tokens issued or accepted yet; applies if the provider uses JWTs (B-117)")
s("V10.1.1 V10.1.2 V10.2.1 V10.2.2 V10.3.1 V10.3.2 V10.3.3 V10.3.4 V10.5.1 V10.5.2 V10.5.3 V10.5.4 V10.5.5", D, "OIDC client or resource-server duties apply once a provider is integrated (B-117)")
s("V10.4.1 V10.4.2 V10.4.3 V10.4.4 V10.4.5 V10.4.6 V10.4.7 V10.4.8 V10.4.9 V10.4.10 V10.4.11 V10.6.1 V10.6.2 V10.7.1 V10.7.2 V10.7.3", X, "We are not an authorization server or OpenID provider")
# V8
s("V8.1.1", M, "docs/access-model.md")
s("V8.1.2 V8.2.3", P, "Restricted fields (EIN) are stored encrypted and read as last four only; no general field-level policy")
s("V8.2.1", P, "Decision authority enforced in the database by role; other routes rely on the development identity until B-117")
s("V8.2.2 V8.3.1 V8.4.1", M, "Forced row-level security by tenant, non-owner role; foreign ids return not found (test/db/rls.test.ts)")
# V11
s("V11.1.1", P, "Policy and lifecycle proposed in docs/DATA_PROTECTION.md; no rotation tooling (B-140)")
s("V11.1.2", M, "docs/DATA_PROTECTION.md section 2")
s("V11.2.1", M, "Node crypto only; no custom primitives")
s("V11.2.2", P, "Version byte allows migration; no algorithm agility layer")
s("V11.2.3 V11.3.3 V11.4.3 V11.6.1", M, "AES-256-GCM (authenticated), SHA-256, HMAC-SHA256; tamper tests in test/unit/crypto-storage.test.ts")
s("V11.3.1 V11.3.2", M, f"{T}: only aes-256-gcm is used")
s("V11.4.1", M, "SHA-256 and HMAC-SHA256 only")
s("V11.4.2 V11.4.4", X, "No passwords stored or derived; key derivation is HKDF from a high-entropy master")
s("V11.5.1", M, f"{T}: no Math.random; randomUUID and randomBytes used")
# V12
s("V12.1.1 V12.1.2 V12.2.1 V12.2.2", D, "TLS terminated by the host; the host documents TLS 1.3 (S-37) but our deployment is unverified")
s("V12.1.3 V12.3.3 V12.3.4", X, "No mTLS and no internal HTTP services")
s("V12.3.1", M, f"Production refuses a database URL without sslmode require or stricter ({T}); webhooks must be https")
s("V12.3.2", M, "Default Node certificate validation; no rejectUnauthorized override in the code")
# V13
s("V13.1.1", P, "Communications shown in diagrams/ and ARCHITECTURE.md; no complete list")
s("V13.2.1", P, "Database role credentials, webhook HMAC and worker bearer secret; no uniform service-authentication standard")
s("V13.2.2", M, "uw_app is non-owner with no BYPASSRLS (test/db/rls.test.ts)")
s("V13.2.3", M, f"Production refuses development credentials ({T})")
s("V13.2.4", P, "Webhook URL checks; no lender-specific allowlist; model egress only through the gateway")
s("V13.2.5 V13.3.1 V13.4.1 V13.4.2 V13.4.3 V13.4.4", D, "Depends on the hosting and secret-store choice (D-026); the demo runs next dev, production refuses the dev identity")
s("V13.3.2", P, "Secrets read from environment; separation per secret not designed")
s("V13.4.5", M, "Metrics endpoint is disabled unless a secret is set and compares it in constant time (e2e)")
# V14
s("V14.1.1 V14.1.2", M, "docs/DATA_PROTECTION.md sections 1")
s("V14.2.1", M, "EIN and documents travel in bodies; URLs carry only UUIDs")
s("V14.2.2", P, "Cache-Control no-store set; shared caches at the host unverified")
s("V14.2.3", P, "No third-party scripts or trackers in the code; not independently scanned")
s("V14.2.4", P, "Encryption, logging and access rules defined; retention not set (LEGAL_REVIEW.md)")
s("V14.3.1", D, "No client sessions yet")
s("V14.3.2", M, "Cache-Control no-store on all routes (next.config.ts)")
s("V14.3.3", M, f"{T}: no browser storage")
# V15
s("V15.1.1", P, "Proposed time frames in DEVSECOPS.md; untested in a real incident")
s("V15.1.2", M, "CycloneDX SBOM generated in CI (npm run sbom)")
s("V15.1.3", P, "Gateway budgets and body caps exist; no document of resource-heavy functions or load test")
s("V15.2.1", M, "npm audit shows no vulnerabilities in production dependencies at assessment date (re-check each release)")
s("V15.2.2", P, "Rate limits, gateway budgets and timeouts; no load test")
s("V15.2.3", P, "No debug routes; health and metrics only; demo uses next dev")
s("V15.3.1", P, "Responses are small and hand-built; not audited route by route")
s("V15.3.2", M, f"{T}: outbound fetch uses redirect error")
s("V15.3.3", M, "Request bodies parsed through explicit zod schemas")
s("V15.3.4", P, "See V4.1.3")
s("V15.3.5 V15.3.6 V15.3.7", P, "TypeScript strict mode and zod parsing; no specific review for prototype pollution or parameter pollution")
# V16
s("V16.1.1", M, "docs/DATA_PROTECTION.md section 3")
s("V16.2.1", P, "Time, route, status and request id are logged; actor is absent until authentication")
s("V16.2.2 V16.2.3 V16.2.4", M, "UTC ISO-8601 JSON lines to stdout only (src/observability/log.ts)")
s("V16.2.5 V16.4.1", M, f"Scrubber masks sensitive fields and patterns; JSON encoding prevents log injection ({H})")
s("V16.3.1", D, "No authentication events yet")
s("V16.3.2 V16.3.3", P, "403, 413, 415, 429 and 400 appear as access-log statuses; no actor or dedicated security event stream")
s("V16.3.4", M, "Unhandled errors are logged with scrubbed text and request id")
s("V16.4.2", P, "Database audit is append-only and tamper-evident; stdout logs depend on the host")
s("V16.4.3", N, "No separate log analysis or alerting system")
s("V16.5.1", M, f"Generic 500 body with request id ({H})")
s("V16.5.2", P, "Gateway timeouts and outbox retry with backoff; no circuit breaker")
s("V16.5.3", M, "Rules and gates fail closed (rule pack, database decision gate)")
# V17 (L2)
s("V17.1.1 V17.2.1 V17.2.2 V17.2.3 V17.2.4 V17.3.1 V17.3.2", X, "No WebRTC")

# --- Authentication added 2026-10-22 (OpenID Connect sign-in, database-enforced sessions; docs/AUTHENTICATION.md). These override the earlier entries. ---
AT = "test/unit/auth.test.ts"; AD = "test/db/auth.test.ts"; AE = "scripts/e2e-auth.mjs"
DELEG = "Delegated to the identity provider; not verifiable until a provider is chosen and evaluated against docs/AUTHENTICATION.md (B-117)"
s("V3.3.1 V3.3.2 V3.3.3 V3.3.4", M, f"Session cookie __Host-uw_session: Secure, HttpOnly, SameSite=Lax, Path=/, no Domain ({AT}, {AE}); the token is not readable by scripts")
s("V3.5.1", P, f"SameSite=Lax cookies, JSON-only POST routes, Next server-action Origin check, logout Origin check ({AE}); no CSRF token")
s("V3.5.2", M, f"JSON POST routes require application/json (forces a CORS preflight); cookies are SameSite=Lax ({H}, {AE})")
s(" ".join(i for i in "V6.1.1 V6.1.2 V6.1.3 V6.2.1 V6.2.2 V6.2.3 V6.2.4 V6.2.5 V6.2.6 V6.2.7 V6.2.8 V6.2.9 V6.2.10 V6.2.11 V6.2.12 V6.3.1 V6.4.1 V6.4.3 V6.4.4 V6.5.1 V6.5.2 V6.5.3 V6.5.4 V6.5.5 V6.6.1 V6.6.2 V6.6.3".split()), D, DELEG)
s("V6.3.3", P, "MFA can be required: OIDC_REQUIRED_AMR makes the ID token's amr claim mandatory (tested); whether the provider issues amr correctly is provider-specific")
s("V6.3.4", M, "One authentication pathway: OpenID Connect to a single configured issuer (docs/AUTHENTICATION.md); no local passwords")
s("V6.8.1", M, f"Identities are keyed by issuer and subject; one subject maps to one user ({AD})")
s("V6.8.2", M, f"ID token signatures verified against the provider's published keys with an asymmetric allowlist ({AT})")
s("V6.8.3", X, "No SAML")
s("V6.8.4", P, "Required amr is enforced when configured; acr and auth_time are not checked")
s("V7.1.1", M, "Idle 30 minutes and absolute 12 hours by default, configurable, documented in docs/AUTHENTICATION.md and enforced in the database")
s("V7.1.2", P, "Concurrent sessions are unlimited and independent; documented, no limit policy")
s("V7.1.3", P, "Single identity provider documented; its session lifetime is not coordinated with ours")
s("V7.2.1 V7.2.2 V7.2.3 V7.2.4", M, f"Opaque 256-bit random tokens, verified in the database by hash, new token on every login ({AT}, {AD})")
s("V7.3.1 V7.3.2", M, f"Inactivity and absolute lifetime enforced by auth.resolve_session ({AD})")
s("V7.4.1", M, f"Logout revokes the session server-side at once; replayed cookies are refused ({AD}, {AE})")
s("V7.4.2", M, f"Disabling a user revokes their sessions and blocks new ones ({AD}, {AE})")
s("V7.4.3 V7.5.1", D, "Authentication factor changes happen at the identity provider; verify its behavior during evaluation (B-117)")
s("V7.4.4", M, "Sign-out button on every signed-in page (src: app/session-bar.tsx)")
s("V7.4.5", M, f"Admins end any user's sessions from the Users screen (auth.revoke_user_sessions; {AD}, {AE})")
s("V7.5.2", M, f"'Your sessions' screen lists and ends a user's own sessions (auth.list_my_sessions, auth.revoke_my_session; test/db/admin.test.ts, {AE}). The provider's re-authentication step is not enforced here")
s("V7.6.1", P, "Our session lifetime is independent of the provider's; behavior on provider logout is not coordinated")
s("V7.6.2", M, f"A session is created only after an explicit sign-in with a valid flow cookie, state, code and token ({AE})")
s("V8.2.1", M, f"Every route declares the role it needs, enforced by a policy test ({H}) and the database decision gate; roles come from our database, not token claims ({AE})")
s("V9.1.1 V9.1.2 V9.1.3 V9.2.1 V9.2.3", M, f"ID token validated: signature, allowed algorithms only, keys from the discovered jwks_uri, expiry, audience ({AT})")
s("V9.2.2", P, "Only ID tokens are accepted by the callback; the typ header is not checked")
s("V9.2.4", X, "We do not issue tokens")
s("V10.1.1", M, "ID tokens are used inside the callback only and are never stored or forwarded; the browser receives only our opaque session cookie")
s("V10.1.2 V10.2.1", M, f"State, nonce and PKCE (S256) bound to an encrypted flow cookie; callback refuses anything else ({AT}, {AE})")
s("V10.2.2 V10.5.3", M, f"Single issuer; discovery issuer must equal the configured issuer ({AT})")
s("V10.3.1 V10.3.2 V10.3.3 V10.3.4", X, "We do not accept access tokens; users hold sessions, not bearer tokens")
s("V10.5.1 V10.5.4", M, f"Nonce and audience checked on every ID token ({AT})")
s("V10.5.2", M, "Users are identified by the pair issuer and sub (src/auth, migration 0007)")
s("V10.5.5", X, "OIDC back-channel logout is not implemented")
s("V14.3.1", M, f"Logout response sends Clear-Site-Data for cache and storage ({AE})")
s("V16.3.1", M, f"Sign-in successes are audit events (auth.login, auth.logout); failures are logged with a reason code and metrics ({AE})")

# --- Per-organization sign-in added 2026-10-22 (D-030) ---
SS = "test/unit/sso.test.ts"; SD = "test/db/sso.test.ts"; SE = "scripts/e2e-sso.mjs"
s("V6.3.4", M, "One pathway: OpenID Connect to the organization's configured provider (or the deployment's single provider); no local passwords (docs/AUTHENTICATION.md)")
s("V6.8.1", M, f"Identities keyed by issuer and subject; a session can be created only in the organization the sign-in started for ({SD}, {SE})")
s("V10.2.2", M, f"With several providers, the provider is bound to the flow by the sealed cookie and a code from another organization's provider is refused ({SE})")
s("V1.3.6", P, f"Administrator-supplied provider URLs: https only, public addresses after DNS resolution, no redirects, size and time limits ({SS}); webhook URLs check IP literals only; DNS rebinding window remains (B-153)")
s("V13.2.4", P, f"Outbound provider calls are restricted to public https hosts ({SS}); no per-organization allowlist and no network-level egress policy yet (B-153)")
s("V14.2.4", P, "Encryption, logging and access rules defined; provider client secrets are write-only and encrypted under the tenant key; retention not set (LEGAL_REVIEW.md)")

src = sys.argv[1]
rows = [r for r in csv.DictReader(open(src, encoding="utf-8-sig")) if r["L"] in ("1", "2")]
out = pathlib.Path(__file__).parent
missing = [r["req_id"] for r in rows if r["req_id"] not in A]
extra = [k for k in A if k not in {r["req_id"] for r in rows}]
if missing or extra:
    sys.exit(f"missing {missing}\nextra {extra}")
with open(out / "ASVS_5.0.0_L2_assessment.csv", "w", newline="") as f:
    w = csv.writer(f); w.writerow(["req_id", "level", "chapter", "requirement_excerpt", "status", "evidence_or_note"])
    for r in rows:
        st, ev = A[r["req_id"]]
        w.writerow([r["req_id"], r["L"], r["chapter_name"], r["req_description"][:140].rstrip(), st, ev])
by = collections.OrderedDict()
for r in rows:
    by.setdefault((r["chapter_id"], r["chapter_name"]), collections.Counter())[A[r["req_id"]][0]] += 1
tot = collections.Counter(); [tot.update(c) for c in by.values()]
cols = [M, P, N, D, X, U]
lines = ["| Chapter | " + " | ".join(cols) + " | Total |", "|---|" + "---|" * (len(cols) + 1)]
for (cid, name), c in by.items():
    lines.append(f"| {cid} {name} | " + " | ".join(str(c[k]) for k in cols) + f" | {sum(c.values())} |")
lines.append("| **All** | " + " | ".join(f"**{tot[k]}**" for k in cols) + f" | **{sum(tot.values())}** |")
(out / "table.md").write_text("\n".join(lines) + "\n")
print(sum(tot.values()), dict(tot))
