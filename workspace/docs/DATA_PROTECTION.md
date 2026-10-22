# Data protection: classification, crypto inventory, logging inventory

Status: PROPOSED engineering policy for the MVP (our own choices, not a lender's policy and not legal advice). Written 2026-10-22 to support the ASVS self-assessment (V11.1.1, V11.1.2, V14.1.1, V14.1.2, V16.1.1). A lender customer's own classification and retention rules override these.

## 1. Data classification and protection requirements
| Class | Examples in this system | Required protection |
|---|---|---|
| Restricted | EIN, uploaded financial documents and their extracted text, bank figures, owner names and ownership percentages | Per-tenant AES-256-GCM encryption at rest where stored as a field or object (EIN, objects); row-level security by tenant; never in logs, URLs, metrics or error bodies; redacted before any model call; only last four digits of EIN displayed |
| Confidential | Cases, exceptions, rule results, memos, decisions, audit events, webhook secrets | Tenant isolation; append-only where recorded; access only through the application role; secrets only in environment/secret store |
| Internal | Request ids, route names, counters | May appear in logs and metrics; metric labels bounded |
| Public | Health endpoint, documentation | None |
Retention: not set. Open decision, lender-dependent (LEGAL_REVIEW.md); until set, nothing is deleted automatically and deletion requires a counsel-reviewed process because decisions and audit events are append-only by design.

## 2. Cryptographic inventory (V11.1.2)
| Use | Algorithm and parameters | Where | Key and custody |
|---|---|---|---|
| Field and object encryption | AES-256-GCM, 96-bit random IV, 128-bit tag, version byte, additional authenticated data binds tenant and field | src/crypto/fieldCrypto.ts, src/storage/objectStore.ts | Per-tenant key derived with HKDF-SHA256 from a master secret and the tenant id; master from environment (local provider). KMS provider is a seam, not implemented (B-140) |
| Webhook signature | HMAC-SHA256 over timestamp and body, constant-time compare, 300-second window | src/servicing/webhook.ts | Per-subscription secret from environment/configuration |
| Audit hash chain | SHA-256 over tenant, sequence, previous hash and event content | db/migrations/0001_core.sql | None (integrity only) |
| Content hashes | SHA-256 | src/storage/objectStore.ts, document records | None |
| Case reference | SHA-256 of normalized inputs, truncated | src/application/submit.ts | None |
| Identifiers and nonces | Node crypto randomness (randomUUID, randomBytes) | throughout | n/a; a test forbids Math.random |
| Transport | TLS provided by the host for HTTP; database TLS enforced in production by configuration check | src/server-env.ts | Host-managed |
Not present: password hashing (no passwords stored; authentication is deferred to a provider, B-117), asymmetric signing, JWT handling.
Key lifecycle (V11.1.1), proposed: generate per environment; rotate master on suspected compromise and at least annually; rotation requires re-encryption by tenant (version byte allows migration); destroy by deleting the master and any backups of it. Not yet implemented as tooling (B-140).

## 3. Logging inventory (V16.1.1)
| Layer | Events | Format and sink | Sensitive data rule |
|---|---|---|---|
| HTTP wrapper | One access line per request (route, method, status, duration, request id); unhandled errors with scrubbed error text | JSON lines to process stdout (platform log collection, not yet configured), UTC ISO-8601 timestamps | Scrubber masks identifier-like field names and redacts identifier patterns inside strings; no bodies logged |
| Metrics | Request counters by route and status, domain counters (decisions, deliveries) | Prometheus text at a secret-protected endpoint | Bounded label values |
| Database audit ledger | Case, fact, exception, rule, memo, decision and outbox events with actor and time | Append-only hash-chained table in the tenant's database | Restricted data stored only as ids or last four digits |
| Not logged today | Authentication events (no authentication yet); log shipping to a separate analysis system; alerting | n/a | n/a |
