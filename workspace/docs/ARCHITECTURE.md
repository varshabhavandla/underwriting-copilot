# Reference architecture (B-201)

Status: provisional design for the MVP and a first lender pilot. Labels: [V] verified in a cited source, [I] inferred, [A] assumed. Nothing is deployed.
Principles: AI extracts, reconciles and drafts; tested code computes and applies rules; a human underwriter decides (D-001). Boring, managed, low-cost. Every fact has a citation. Every action is in an append-only audit ledger.

## 1. Components
```mermaid
flowchart LR
  subgraph Users
    B[Borrower]
    U[Underwriter]
    A[Lender admin]
  end
  subgraph Vercel["Vercel (Next.js app, TypeScript)"]
    WEB[Web app: borrower portal, underwriter console, admin]
    API[API routes and server actions: authn, tenant context, validation]
    WF[Durable workflows: ingestion, extraction, rules, memo draft]
  end
  subgraph Core["Domain core (pure TypeScript library)"]
    RULES[Rule packs: SOP 50 10 8.1, versioned, cited]
    CALC[Calculators: DSC, collateral, guaranty, integer cents]
    GATE[Authorization and decision gate]
  end
  subgraph Data["Data plane"]
    PG[(Postgres: forced RLS, append-only audit ledger)]
    OBJ[(Object storage: documents, per-tenant keys)]
    KMS[Key management: per-tenant keys]
  end
  LLMGW[LLM gateway: redaction, schema-checked output, budgets, logging]
  LLM[(LLM and OCR providers)]
  IDP[Identity provider: SSO, MFA]
  SERV[Servicing adapter interface]
  MOCK[Mock lender servicing system]
  B --> WEB
  U --> WEB
  A --> WEB
  WEB --> API
  API --> IDP
  API --> PG
  API --> OBJ
  API --> WF
  WF --> RULES
  WF --> CALC
  WF --> LLMGW
  LLMGW --> LLM
  WF --> PG
  WF --> OBJ
  API --> GATE
  OBJ --- KMS
  PG --- KMS
  GATE --> SERV
  SERV --> MOCK
```

- **App on Vercel (TypeScript, Next.js).** Borrower portal, underwriter console, admin. API routes and server actions are thin: authenticate, resolve the tenant, validate input (schema validation at every boundary), call the domain core.
- **Domain core (pure TypeScript library, already started in `workspace/app/src`).** Rule packs, calculators, reconciliation, case state machine, decision gate. No I/O; fully unit-testable.
- **Durable workflows.** Ingestion, extraction, rules and memo drafting run as retryable steps. Vercel Workflows (durable steps that resume after crashes or deployments) and Queues (at-least-once delivery, so every step must be idempotent) are documented but Queues is reported as beta [V, S-26]. Functions alone are not enough: Pro functions can run up to 800 seconds (1800 in beta) [V, S-24], and uploads through a function are capped at 4.5 MB [V, S-24].
- **Postgres** with forced row-level security and an append-only audit ledger (section 4). Vendor not chosen (D-014).
- **Object storage** for documents, with per-tenant keys (section 4). Vendor not chosen (D-013).
- **LLM gateway** (section 3 and docs/AGENTIC_LAYER.md): the only code that talks to a model provider.
- **Identity provider** for lender staff with SSO and MFA (D-011 open).
- **Servicing adapter interface** with a mock implementation; webhooks and events emitted only after a recorded human decision.

## 2. Data flow
```mermaid
sequenceDiagram
  autonumber
  participant Bor as Borrower
  participant App as App/API
  participant Obj as Object storage
  participant WF as Workflow
  participant GW as LLM gateway
  participant DB as Postgres + ledger
  participant UW as Underwriter
  Bor->>App: request upload URL (authenticated, tenant scoped)
  App->>Obj: create signed URL (tenant prefix, size and type limits)
  Bor->>Obj: upload document directly (bypasses 4.5 MB function limit)
  Obj-->>WF: object-created event (idempotency key = tenant, case, content hash)
  WF->>DB: ledger: document received (hash, version)
  WF->>WF: malware scan, type check, OCR and layout
  WF->>GW: extract candidate facts (document text is data, never instructions)
  GW-->>WF: schema-valid facts with page and passage citations
  WF->>WF: deterministic validators (totals, dates, formats, cross-document checks)
  WF->>DB: facts stored as proposed, with citations, ledger entries
  WF->>WF: run rule pack, calculators, exception detection
  WF->>GW: draft memo sections from accepted fact IDs only
  GW-->>WF: draft with fact-ID citations
  WF->>WF: verify every number and claim matches a fact or calculation
  WF->>DB: case status needs_review
  UW->>App: open prepared file, exceptions, evidence links
  UW->>App: approve / decline / request more info, with reasons
  App->>DB: decision appended (reviewer, rule versions, overrides)
  App->>App: servicing event emitted only after a recorded human decision
```

Design points: direct-to-storage upload avoids the 4.5 MB function body limit [V, S-24]; each step is idempotent by key (tenant, case, content hash); facts are stored as proposed, with citations; acceptance needs deterministic validation or a human confirmation (confidence alone never accepts a fact, AGENTS rule 8).

## 3. Trust boundaries
```mermaid
flowchart TB
  subgraph Internet["Untrusted: internet and borrower-supplied content"]
    BR[Browsers]
    DOCS[Uploaded documents: untrusted data, may contain instructions]
  end
  subgraph Edge["Boundary 1: authenticated edge (Vercel)"]
    APP[App and API]
  end
  subgraph Tenant["Boundary 2: tenant isolation"]
    PGT[(Rows scoped by tenant: forced RLS)]
    OBJT[(Objects under tenant prefix and tenant key)]
  end
  subgraph Proc["Boundary 3: document processing (no write or decision tools)"]
    EXT[Extraction and drafting workers]
  end
  subgraph Ext["Boundary 4: third parties (subprocessors)"]
    LLMP[LLM provider]
    OCRP[OCR provider if separate]
    IDPP[Identity provider]
    HOST[Hosting and database vendors]
  end
  subgraph Human["Boundary 5: decision authority"]
    UWR[Authorized underwriter]
  end
  BR --> APP
  DOCS --> OBJT
  APP --> PGT
  OBJT --> EXT
  EXT -->|redacted text only| LLMP
  EXT --> OCRP
  APP --> IDPP
  EXT -->|proposals only| PGT
  PGT --> UWR
  UWR -->|decision record| PGT
```

1. Internet to the authenticated edge. 2. Tenant isolation (data plane). 3. Document processing: workers that read untrusted documents have no tools that write canonical data, record decisions, send messages or call arbitrary URLs; they emit proposals only. 4. Third parties are subprocessors and appear in the vendor list a lender will review. 5. Decision authority: only an authorized underwriter's recorded action advances a case to a decision.

## 4. Tenant isolation and encryption
```mermaid
flowchart LR
  REQ[Request with verified identity] --> CTX[Tenant context: tenant id from the session, never from the request body]
  CTX --> TX[Transaction: SET LOCAL app.tenant_id]
  TX --> RLS[Postgres forced row-level security: app role is not owner, no BYPASSRLS]
  RLS --> ROWS[(Tenant rows)]
  CTX --> PFX[Object key = tenant id / case id / content hash]
  PFX --> ENV[Envelope encryption]
  ENV --> DEK[Data key per tenant]
  DEK -->|wrapped by| KEK[Key in key management service, one per tenant]
  KEK -.->|revoke or schedule deletion| SHRED[Tenant offboarding: documents unreadable]
  MIG[Migration role: owns tables, used only by CI] -.-> RLS
```

- **Row-level security [V, S-25].** Postgres docs: with RLS enabled and no policy, all rows are denied; table owners normally bypass RLS unless the table is set to FORCE ROW LEVEL SECURITY; superusers and roles with BYPASSRLS always bypass. Therefore: the application role is not the table owner, has no BYPASSRLS, and tables are FORCEd; a separate migration role owns tables and is used only by CI. Tenant id comes from the verified session and is set per transaction (`SET LOCAL`), which is safe with transaction-mode connection pooling [I].
- **Tests that fail if weakened** (backlog B-402): a test connects as the app role and proves cross-tenant reads return nothing, paired with a positive control proving the same query succeeds for the owning tenant (a denial test needs a control or it can pass because nothing ran).
- **Per-tenant encryption.** Envelope encryption: a data key per tenant wrapped by a key in a key-management service; deleting or revoking the tenant key makes the tenant's documents unreadable (offboarding). Which service is open (D-013). [A] Using AWS KMS and S3 from a Vercel app requires cross-cloud authentication; whether Vercel's OIDC federation covers this is not verified (B-113).
- **Application-level field encryption** for the most sensitive fields (taxpayer IDs, account numbers), so a database dump alone is not enough [I].
- **Secrets** only in the hosting platform's secret store, never in the repository; least-privilege roles per component.

## 5. Case lifecycle
```mermaid
stateDiagram-v2
  [*] --> Received
  Received --> Processing: documents stored and hashed
  Processing --> NeedsReview: extraction, validation, rules and draft complete
  Processing --> Failed: unrecoverable error (retryable, idempotent)
  NeedsReview --> InfoRequested: underwriter requests more information
  InfoRequested --> Processing: new documents received
  NeedsReview --> Approved: underwriter approves
  NeedsReview --> Declined: underwriter declines
  Approved --> HandedOff: servicing event emitted after the decision
  Declined --> [*]
  HandedOff --> [*]
  Failed --> Processing: retry
```

"Approved" and "Declined" are reachable only through a decision record by an authorized underwriter; the processing pipeline can only reach NeedsReview or Failed.

## 6. Audit ledger (summary; full event list in docs/AGENTIC_LAYER.md)
Append-only table per tenant; a trigger rejects UPDATE and DELETE; each event stores the hash of the previous event so tampering is detectable [I, design]; periodic anchoring of the chain head to an external write-once store is a later hardening step. The ledger holds references and hashes, not raw document text.

## 7. Open decisions and risks
| Decision | Options | Status |
|---|---|---|
| D-011 Authentication | Managed identity provider with SAML SSO and MFA; criteria: SSO for lender staff, organization/tenant model, audit logs, data residency | Open (B-117). Prices not verified |
| D-013 Document storage and tenant keys | S3 + KMS; Vercel Blob; other | Open. Per-tenant key control on Vercel Blob not verified |
| D-014 Database | Postgres via Vercel marketplace partner; AWS RDS | Open. Need: forced RLS, point-in-time recovery, region pinning |
| D-015 LLM/OCR provider | One or more providers behind the gateway | Open. Requirements: no training on our data, retention terms, region, SOC report; verify each |
| D-016 Background execution | Vercel Workflows (durable) vs Queues | Leaning Workflows [I, S-26]; confirm limits and cost |

Cost report: provisioned monthly cloud cost today is $0 (nothing deployed, local development only). Production-like spend is not estimated here because plan prices were not verified; B-113 will fill a cost model from vendor price pages. Known cost drivers: function active CPU and memory [V, rates in S-7], database, object storage and key operations, LLM and OCR per document, logging.

Top risks: cross-cloud key and identity wiring; beta status of Queues and large-duration functions; per-tenant key support on the chosen storage; subprocessor count in lender vendor review.
