# Hosting options for a lender pilot

Date 2026-10-22. Prepared for a decision by the builder; nothing here was purchased, provisioned or discussed with a vendor. Labels: [V] stated on the cited vendor page (S-57 to S-70), [S] from a secondary source, [I] our inference, [A] assumption, [U] unverified. Prices are list prices read today and change; the cost lines are a floor for a pilot, not a quote, and exclude support plans, logging, WAF, domains, data transfer, NAT and staff time.

## 1. What the application needs (from our own code and open items)
| Need | Why | Where it comes from |
|---|---|---|
| Next.js 16 on Node 22; request bodies up to 4 MB today, direct-to-storage uploads later | the app | B-126 |
| PostgreSQL 16 where we can create our own roles: owner and application, **neither able to bypass row-level security**, SECURITY DEFINER functions, forced RLS | the isolation model is the product's core promise | migrations 0001 to 0009, rls tests |
| Per-request tenant setting with `set_config(..., true)` (transaction-local) through whatever pooler sits in front | every request | `withTenant` |
| Object storage with encryption and no public access | uploaded documents | B-126 |
| Managed key custody, one key per tenant | field and object encryption, client secrets | B-140 |
| A malware scanner that can be reached synchronously, or an equivalent asynchronous design | uploads fail closed today | B-146, B-155 |
| Fixed or restricted egress for calls to lender-supplied URLs (identity providers, webhooks) | SSRF defense in depth | B-153 |
| Evidence a lender can review: attestations, region, subprocessors, logs | vendor-risk review under 88 FR 37920 (S-41) | BENCHMARK.md |
| Low operational load for one builder | staffing | constraint |

## 2. Findings that change the picture (verified)
1. **Neon's default roles bypass row-level security.** Roles created in its console, CLI or API, including the default role, belong to `neon_superuser`, which includes BYPASSRLS for projects created after August 15, 2023; roles created with SQL "get only basic privileges" [V, S-62]. The page does not say whether SQL-created roles can be NOBYPASSRLS. Our design needs two roles that cannot bypass; this must be tested before choosing Neon [U].
2. **Neon's pooler is PgBouncer in transaction mode and lists `SET` as unsupported**; the page does not mention `set_config` [V, S-61]. Whether our transaction-local `set_config(..., true)` is safe through it is unverified [U]. A wrong answer here is a tenant-isolation failure, so it needs a test, not an assumption.
3. **A direct, long-lived connection avoids both issues.** A container host (AWS, Google Cloud, or Vercel Daemons) can use the app's own small connection pool to the database without a transaction pooler [I]. AWS RDS Proxy would pin connections on `SET` and on `set_config` assignments for PostgreSQL [V, S-66]; we would not need it for containers.
4. **Vercel cannot host the scanner as we built it.** Daemons are in public beta and "don't accept inbound traffic" [V, S-60]; ClamAV's daemon is a TCP service. Functions are limited to 250 MB bundles (5 GB large functions in beta, not available with Secure Compute or Static IPs) [V, S-57, S-58]. So on Vercel the scanner lives elsewhere (another cloud), or scanning becomes an asynchronous queue worker (a design change), or we use a scanning API [I].
5. **Fixed egress on Vercel costs money.** Static IPs are $100 per month per project on Pro, plus private data transfer; Secure Compute (dedicated network, VPC peering) is Enterprise only with custom pricing [V, S-58, S-59]. Without either, our requests to providers and webhooks come from unfixed addresses.
6. **AWS App Runner stopped accepting new customers on April 30, 2026**; AWS points to ECS Express Mode [S, S-69]. Ruled out.
7. **Prices that could not be read:** Cloud Run, Cloud SQL and RDS instance tables did not render; RDS figures below are from a third-party summary [S, S-70] and Google Cloud's are not given [U].

## 3. Options
### A. Vercel for the app, Neon for Postgres, a scanner elsewhere
- **Fits:** least operations; deployments, TLS, CDN and previews are managed; Vercel states SOC 2 Type 2, ISO 27001 and HIPAA BAA on Pro and Enterprise (reports not read) [V, S-37]; Blob is private-capable, AES-256 at rest, S3-backed, with client uploads for large files [V, S-63, S-64]; 800-second functions [V, S-35].
- **Gaps:** BYPASSRLS default and pooler `SET` behavior (findings 1 and 2) must be proven; no per-tenant customer-managed keys described for Neon or Blob [U], so B-140 means calling a key service elsewhere (AWS or Google Cloud KMS from Vercel) [I]; scanner and fixed egress need extra paid pieces (findings 4 and 5); Neon's SOC 2, IP allow-listing and private networking are listed on or tied to the Scale plan [V, S-39, S-62]; region choice is not a residency guarantee [V, S-36].
- **Floor (pilot, one environment):** Vercel Pro $20 base plus $20 per developer seat [V, S-38], about $40 for one seat; Neon Scale at 0.25 compute unit and 10 GB about $44 (compute $0.222 per CU-hour, storage $0.35 per GB-month) [V, S-39]; Static IPs $100 [V]; a scanner host about $34 (1 vCPU, 4 GB ARM Fargate, memory size assumed [A]) with its own connectivity; Blob not priced here. Roughly **$220 to $260 per month** [I].

### B. AWS containers: ECS on Fargate, RDS for PostgreSQL, S3 with KMS, scanner as a container
- **Fits:** long-running containers allow the app's own pool (finding 3) and a ClamAV container reachable on a private network, so the scanner code we wrote works as is; KMS gives managed key custody and per-tenant keys at $1 per key per month [V, S-67]; VPC, security groups and NAT give controllable fixed egress [I]; RDS is standard PostgreSQL with full role control (we run `roles.sql` and the migrations as written) [I, to confirm]; GuardDuty Malware Protection for S3 is an alternative managed scanner at $0.09 per GB plus about $0.215 per 1,000 objects, with a free tier of 1,000 requests and 1 GB per month [V, S-65]. Its behavior details (asynchronous, tag-based, size limits) were not readable and mean a different upload flow [U].
- **Gaps:** most operations work of the three (infrastructure as code, deploys, patching, backups, alarms); no built-in preview environments; a solo builder carries the pager.
- **Floor (pilot):** Fargate ARM at $0.0324 per vCPU-hour and $0.0036 per GB-hour [V, S-68]: app 0.5 vCPU and 1 GB about $14, scanner 1 vCPU and 4 GB about $34 [A], worker 0.25 vCPU and 0.5 GB about $7; Application Load Balancer $0.0225 per hour plus one load unit at $0.008 about $22 [V, S-71]; KMS one key $1; scanning within the free tier; RDS db.t4g.small about $0.032 per hour single-AZ and $0.064 Multi-AZ, gp3 about $0.115 per GB-month [S, S-70]. Roughly **$105 per month single-AZ, $135 Multi-AZ** [I].

### C. Google Cloud: Cloud Run and Cloud SQL (or any container platform)
- **Fits:** like B, containers and standard managed PostgreSQL; Cloud KMS for keys [U]; the scanner runs as another service. Choose it if the first lender requires Google Cloud.
- **Gaps:** prices could not be read (finding 7); no verified managed malware scanner for object storage [U]; same operations load as B.
- **Floor:** not computed.

### D. Hybrid: Vercel app on Secure Compute with data in AWS
Vercel Secure Compute offers dedicated static IPs and VPC peering to an AWS VPC (Enterprise, custom price) [V, S-59]. It combines Vercel's developer experience with B's data plane, but needs an Enterprise contract and runs two platforms; not recommended for a pilot [I].

## 4. Comparison
| | A Vercel + Neon | B AWS containers | C Google Cloud | D Hybrid |
|---|---|---|---|---|
| Isolation model works as built | **unproven** (roles, pooler) | works (standard Postgres, direct pool) [I] | works [I] | works |
| Scanner as built | no (host elsewhere) | **yes** | yes | yes |
| Per-tenant key custody | elsewhere | **native KMS** | native [U] | native |
| Fixed egress | $100 per month or Enterprise | VPC and NAT [I] | VPC [U] | included |
| Operations for one builder | **lowest** | highest | high | high |
| Pilot cost floor | about $220 to $260 | about $105 to $135 | not computed | Enterprise |
| Lender evidence | Vercel SOC 2 claim; Neon on Scale | AWS reports (not read) | Google reports (not read) | both |
| Time to a lender-reviewable pilot | fast to deploy, slow to harden | slower to deploy, closer to hardened | like B | slowest |

## 5. Work our code needs under any option
Replace `LocalObjectStore` with a cloud object store (B-126, size M); implement a KMS-backed `KeyProvider` with data-key caching (B-140, M); choose the scanning flow (synchronous clamd, or asynchronous with a tag-gated release, B-155, S to M); infrastructure as code and a deploy pipeline (B-122, M to L); managed-database test of roles, RLS and the pooler or pool (B-136, S); egress policy (B-153, S); logging and alerting (B-147, M). These are estimates [A].

## 6. Recommendation
If you want one choice now: **B, AWS containers**, for the pilot, because it is the only option where every control we have already built and tested works as written, with the key custody and scanner we still lack, at the lowest floor price, and because lender reviewers are likely to know it [I]. The price is operations work and no previews. Choose **A** only if minimizing operations matters more than the open isolation questions, and only after the two tests below pass. This is a recommendation, not a decision; the app is portable (a Next.js server, a PostgreSQL database, object storage, a key service), so the choice is not a one-way door [I].

## 7. Cheap tests that would settle the open questions (each needs your approval to create an account)
1. Neon free tier: create the two roles with SQL, check `rolbypassrls`, run the migrations and `test/db` suite against the pooled and direct endpoints [settles findings 1 and 2; cost $0 on the free plan, S-39].
2. AWS: one RDS instance for a day plus a Fargate task running the database tests and the scanner against a real ClamAV [settles B's open items; a few dollars].
3. Ask the first lender candidate which clouds and regions their vendor-risk process accepts; this may decide the question before any test.

## 8. Update: Vercel for testing
The builder chose Vercel for testing (D-033). The runbook is docs/VERCEL_TEST_DEPLOYMENT.md, and `npm run db:check` runs the two Neon tests from section 7 against any database URL. The pilot decision above is still open.

## 9. Decisions needed from you
Which option to plan around (or "wait for the lender"); a monthly budget ceiling; whether you will run the pager yourself; permission to create vendor accounts for the tests in section 7.
