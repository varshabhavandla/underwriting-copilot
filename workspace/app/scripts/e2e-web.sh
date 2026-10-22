#!/usr/bin/env bash
# End-to-end check of the running web app against a fresh local database. Exits non-zero on the first mismatch.
# Needs: UW_TEST_ADMIN_URL (disposable Postgres superuser), psql, curl, openssl.
set -uo pipefail
cd "$(dirname "$0")/.."; . scripts/lib/killport.sh
cd "$(dirname "$0")/.."
: "${UW_TEST_ADMIN_URL:?set UW_TEST_ADMIN_URL}"
WORK="$(mktemp -d)"; trap '[ -n "${SRV:-}" ] && kill -- -$SRV 2>/dev/null; [ -n "${CLAM:-}" ] && kill -- -$CLAM 2>/dev/null; killport "$WEB_PORT" "${CLAM_PORT:-}"; rm -rf "$WORK"' EXIT
HOSTPORT=$(echo "$UW_TEST_ADMIN_URL" | sed -E 's#^[a-z]+://([^@]*@)?([^/]+)/.*#\2#'); H=${HOSTPORT%:*}; PORT=${HOSTPORT#*:}
ADMIN_USER=$(echo "$UW_TEST_ADMIN_URL" | sed -E 's#^[a-z]+://([^:@/]+).*#\1#')
if echo "$UW_TEST_ADMIN_URL" | grep -qE '^[a-z]+://[^:@/]+:[^@]+@'; then export PGPASSWORD=$(echo "$UW_TEST_ADMIN_URL" | sed -E 's#^[a-z]+://[^:@/]+:([^@]*)@.*#\1#'); fi
DB=uw_e2e
psqlx() { psql -h "$H" -p "$PORT" -U "$ADMIN_USER" -d $DB -tAq "$@"; }
FAIL=0
expect() { if [ "$2" = "$3" ]; then echo "ok   $1"; else echo "FAIL $1: expected [$2] got [$3]"; FAIL=1; fi; }

SETUP=$(npx tsx scripts/setup-db.ts $DB 2>&1) || { echo "FAIL database setup: $SETUP"; exit 1; }
T=$(echo "$SETUP" | sed -n 's/^TENANT=//p'); U=$(echo "$SETUP" | sed -n 's/^USER=//p')
mkdir -p "$WORK/uploads"
export DATABASE_URL="postgres://uw_app:uw_app_dev@$H:$PORT/$DB" DEV_TENANT_ID=$T DEV_USER_ID=$U UPLOAD_DIR="$WORK/uploads" FIELD_KEY_MASTER=$(openssl rand -base64 32) WORKER_SECRET=$(openssl rand -hex 16) METRICS_SECRET=$(openssl rand -hex 16)
WEB_PORT=${WEB_PORT:-3110}
# uploads go through a (fake) ClamAV daemon that recognizes only the EICAR test string
CLAM_PORT=${CLAM_PORT:-3311}
setsid npx tsx scripts/fake-clamd.ts "$CLAM_PORT" > "$WORK/clamd.log" 2>&1 & CLAM=$!
for _ in $(seq 1 30); do grep -q "fake clamd" "$WORK/clamd.log" && break; sleep 1; done
export CLAMD_HOST=127.0.0.1 CLAMD_PORT=$CLAM_PORT TRUSTED_PROXY_HOPS=0
setsid node_modules/.bin/next dev -p "$WEB_PORT" > "$WORK/server.log" 2>&1 & SRV=$!
for _ in $(seq 1 90); do curl -s -o /dev/null "http://127.0.0.1:$WEB_PORT/api/health" && break; sleep 1; done
B="http://127.0.0.1:$WEB_PORT"
code() { curl -s -o /dev/null -w "%{http_code}" "$@"; }
APP='{"legalName":"Harbor Diner Inc","entityType":"s_corp","ein":"12-3456789","naics":"722511","yearsInBusiness":6,"requestedTermMonths":120,"loanAmount":"$250,000","purposes":["working_capital","equipment"],"owners":[{"name":"A Owner","percent":60},{"name":"B Owner","percent":40}],"certifyAccurate":true}'
J='content-type: application/json'

R=$(curl -s -w "\n%{http_code}" -X POST "$B/api/applications" -H "$J" -d "$APP"); expect "valid application -> 201" 201 "$(echo "$R" | tail -1)"
CASE=$(echo "$R" | head -1 | sed -E 's/.*"caseId":"([^"]+)".*/\1/')
R2=$(curl -s -w "\n%{http_code}" -X POST "$B/api/applications" -H "$J" -d "$APP"); expect "same application again -> 200 (idempotent)" 200 "$(echo "$R2" | tail -1)"
BAD=$(echo "$APP" | sed 's/"percent":40/"percent":30/'); R3=$(curl -s -w "\n%{http_code}" -X POST "$B/api/applications" -H "$J" -d "$BAD")
expect "owners not 100 percent -> 400" 400 "$(echo "$R3" | tail -1)"; expect "error body does not echo the EIN" 0 "$(echo "$R3" | head -1 | grep -c 12-3456789)"
expect "invalid json -> 400" 400 "$(code -X POST "$B/api/applications" -H "$J" -d '{nope')"
expect "oversized body -> 413" 413 "$(head -c 70000 /dev/zero | tr '\0' 'a' | code -X POST "$B/api/applications" -H "$J" --data-binary @-)"

printf 'Net income: $210,000.00\nRevenue: $1,200,000.00\nAs of: 2026-09-30\nTotal assets: $500,000.00\nTotal liabilities: $300,000.00\nTotal equity: $200,000.00\n' > "$WORK/fs.txt"
R=$(curl -s -w "\n%{http_code}" -F "file=@$WORK/fs.txt" -F docType=financial_statement "$B/api/applications/$CASE/documents")
expect "text financial statement -> 201" 201 "$(echo "$R" | tail -1)"; expect "6 facts accepted" 1 "$(echo "$R" | head -1 | grep -c '"factsAccepted":6')"
expect "same file again -> 200 and skipped" 200 "$(code -F "file=@$WORK/fs.txt" -F docType=financial_statement "$B/api/applications/$CASE/documents")"
printf 'MZ\x90\x00\x03\x00\x00\x00' > "$WORK/evil.pdf"; expect "executable named .pdf -> 415" 415 "$(code -F "file=@$WORK/evil.pdf" -F docType=bank_statement "$B/api/applications/$CASE/documents")"
printf '%%PDF-1.7\n1 0 obj<<>>endobj\n' > "$WORK/real.pdf"; expect "real pdf -> 202 manual review" 202 "$(code -F "file=@$WORK/real.pdf" -F docType=bank_statement "$B/api/applications/$CASE/documents")"
expect "unknown case -> 404" 404 "$(code -F "file=@$WORK/fs.txt" -F docType=financial_statement "$B/api/applications/00000000-0000-4000-8000-000000000000/documents")"
# upload hardening: name must match content, no markup, no active PDF, malware scan, fail closed
printf '%%PDF-1.7\n1 0 obj<<>>endobj\n' > "$WORK/mismatch.png"; expect "pdf content named .png -> 415" 415 "$(code -F "file=@$WORK/mismatch.png" -F docType=bank_statement "$B/api/applications/$CASE/documents")"
printf '<svg xmlns="http://www.w3.org/2000/svg" onload="alert(1)"></svg>' > "$WORK/x.txt"; expect "svg named .txt -> 415" 415 "$(code -F "file=@$WORK/x.txt" -F docType=financial_statement "$B/api/applications/$CASE/documents")"
printf '%%PDF-1.7\n1 0 obj<</Type/Catalog/OpenAction<</S/JavaScript/JS(app.alert(1))>>>>endobj\n' > "$WORK/active.pdf"; expect "pdf with javascript -> 415" 415 "$(code -F "file=@$WORK/active.pdf" -F docType=bank_statement "$B/api/applications/$CASE/documents")"
printf 'Statement text %s\n' 'X5O!P%@AP[4\PZX54(P^)7CC)7}$EICAR-STANDARD-ANTIVIRUS-TEST-FILE!$H+H*' > "$WORK/eicar.txt"
OBJ0=$(find "$WORK/uploads" -type f | wc -l)
expect "malware test string -> 422" 422 "$(code -F "file=@$WORK/eicar.txt" -F docType=financial_statement "$B/api/applications/$CASE/documents")"
expect "infected upload stored nothing" "$OBJ0" "$(find "$WORK/uploads" -type f | wc -l)"
expect "and left a rejected audit event" 1 "$(psqlx -c "select count(*) from audit_events where action='document.rejected' and subject->>'reason'='malware'")"
kill -- -$CLAM 2>/dev/null; sleep 1
printf 'Statement text two\n' > "$WORK/two.txt"
HDR=$(curl -s -D - -o /dev/null -F "file=@$WORK/two.txt" -F docType=financial_statement "$B/api/applications/$CASE/documents" | tr -d '\r')
expect "scanner down -> 503 (fails closed)" 503 "$(echo "$HDR" | head -1 | awk '{print $2}')"
expect "with a retry hint" 30 "$(echo "$HDR" | awk -F': ' 'tolower($1)=="retry-after"{print $2}')"
expect "and nothing was stored" "$OBJ0" "$(find "$WORK/uploads" -type f | wc -l)"
expect "bad docType -> 400" 400 "$(code -F "file=@$WORK/fs.txt" -F docType=passport "$B/api/applications/$CASE/documents")"
expect "apply page renders" 1 "$(curl -s "$B/apply" | grep -c 'Synthetic data only')"
expect "health ok" 200 "$(code "$B/api/health")"
RB=$(curl -s -w "\n%{http_code}" -X POST "$B/api/cases/$CASE/build"); expect "build file -> 200" 200 "$(echo "$RB" | tail -1)"
expect "memo stored and verified" 1 "$(echo "$RB" | head -1 | grep -c '"memoStored":true')"
expect "case left in needs_review, never approved" 1 "$(echo "$RB" | head -1 | grep -c '"status":"needs_review"')"
expect "build on an unknown case -> 404" 404 "$(code -X POST "$B/api/cases/00000000-0000-4000-8000-000000000000/build")"


RV=$(curl -s "$B/review/$CASE"); 
expect "review page shows facts with citations" 1 "$(echo "$RV" | grep -c 'Facts with citations')"
expect "review page shows SOP rule results" 1 "$(echo "$RV" | grep -c 'Rule results (SBA SOP 50 10)')"
expect "review page shows a decision form" 1 "$(echo "$RV" | grep -c 'Record decision')"
expect "review page states facts are not verified against source" 1 "$(echo "$RV" | grep -c 'not verified against the original source')"
expect "review list shows the business" 1 "$(curl -s "$B/review" | grep -c 'Harbor Diner Inc')"
expect "review for unknown case -> 404" 404 "$(code "$B/review/00000000-0000-4000-8000-000000000000")"
expect "decision: invalid body -> 400" 400 "$(code -X POST "$B/api/cases/$CASE/decision" -H "$J" -d '{"decision":"maybe","reasons":["x"]}')"
expect "decision: no reasons -> 400" 400 "$(code -X POST "$B/api/cases/$CASE/decision" -H "$J" -d '{"decision":"approve","reasons":[]}')"
expect "decision: unknown case -> 404" 404 "$(code -X POST "$B/api/cases/00000000-0000-4000-8000-000000000000/decision" -H "$J" -d '{"decision":"approve","reasons":["x"]}')"
RD=$(curl -s -w "\n%{http_code}" -X POST "$B/api/cases/$CASE/decision" -H "$J" -d '{"decision":"approve","reasons":["Reviewed"]}')
expect "approve with open high exceptions and no override -> 403" 403 "$(echo "$RD" | tail -1)"
expect "case still needs_review after the refused approval" needs_review "$(psqlx -c "select status from cases where id='$CASE'")"
RD2=$(curl -s -w "\n%{http_code}" -X POST "$B/api/cases/$CASE/decision" -H "$J" -d '{"decision":"approve","reasons":["Reviewed"],"overrides":["Missing statements to be collected before closing"]}')
expect "approve with a recorded override -> 200" 200 "$(echo "$RD2" | tail -1)"
expect "second decision on a decided case -> 403" 403 "$(code -X POST "$B/api/cases/$CASE/decision" -H "$J" -d '{"decision":"decline","reasons":["changed mind"]}')"
expect "case approved only through the decision (before delivery)" approved "$(psqlx -c "select status from cases where id='$CASE'")"
expect "decision recorded as the underwriter, with policy version" "1 sba-7a@SOP 50 10 8.1" "$(psqlx -c "select count(*)||' '||max(policy_version) from decisions where case_id='$CASE'")"
expect "outbox event queued by the decision" "case.approved pending" "$(psqlx -c "select event_type||' '||status from outbox_events where case_id='$CASE'")"
expect "delivery route without a secret -> 401" 401 "$(code -X POST "$B/api/outbox/deliver")"
expect "delivery route with a wrong secret -> 401" 401 "$(code -X POST "$B/api/outbox/deliver" -H "authorization: Bearer $(openssl rand -hex 16)")"
RDL=$(curl -s -w "\n%{http_code}" -X POST "$B/api/outbox/deliver" -H "authorization: Bearer $WORKER_SECRET"); expect "delivery run -> 200" 200 "$(echo "$RDL" | tail -1)"
expect "approved case boarded and handed off" "delivered handed_off" "$(psqlx -c "select o.status||' '||c.status from outbox_events o join cases c on c.id=o.case_id where o.case_id='$CASE'")"
expect "external servicing id recorded" 1 "$(psqlx -c "select count(*) from outbox_events where case_id='$CASE' and external_id like 'LN-%'")"
expect "a second delivery run delivers nothing" 1 "$(curl -s -X POST "$B/api/outbox/deliver" -H "authorization: Bearer $WORKER_SECRET" | grep -c '"delivered":0')"
expect "one application stored" 1 "$(psqlx -c "select count(*) from applications")"
expect "EIN is not plaintext in the database" 0 "$(psqlx -c "select count(*) from applications where encode(ein_ciphertext,'escape') like '%3456789%'")"
expect "only last4 stored in the clear" 6789 "$(psqlx -c "select ein_last4 from applications")"
expect "6 accepted facts, all cited" 6 "$(psqlx -c "select count(*) from facts where case_id='$CASE' and status='accepted' and page=1 and length(passage)>0")"
expect "manual-review exception for the pdf" 1 "$(psqlx -c "select count(*) from exceptions where case_id='$CASE' and kind='ocr_required'")"
expect "rule run recorded with 11 results and one verified memo" "1 11 1" "$(psqlx -c "select (select count(*) from rule_runs where case_id='$CASE')||' '||(select count(*) from rule_results where case_id='$CASE')||' '||(select count(*) from memos where case_id='$CASE')")"
expect "missing documents are flagged by rule" 1 "$(psqlx -c "select count(*) from exceptions where case_id='$CASE' and kind='rule:required-documents'")"
expect "2 stored objects, none readable as plaintext" "2 0" "$(echo "$(find "$WORK/uploads" -type f | wc -l) $(grep -rl 'Net income' "$WORK/uploads" | wc -l)")"
CH=$(PGPASSWORD=uw_app_dev psql -h "$H" -p "$PORT" -U uw_app -d $DB -tAq -c "select set_config('app.tenant_id','$T',false)" -c "select coalesce(audit_verify_chain()::text,'intact')" | tail -1)
expect "audit chain verifies" intact "$CH"
expect "form post to a json route -> 415" 415 "$(code -X POST "$B/api/applications" -d 'a=1')"
expect "request id echoed" "rid-test-1234" "$(curl -s -D - -o /dev/null "$B/api/health" -H 'x-request-id: rid-test-1234' | tr -d '\r' | awk -F': ' 'tolower($1)=="x-request-id"{print $2}')"
HDRS=$(curl -s -D - -o /dev/null "$B/api/health" | tr -d '\r' | tr 'A-Z' 'a-z')
expect "security headers on api" 4 "$(echo "$HDRS" | grep -c -E '^(x-content-type-options: nosniff|x-frame-options: deny|cache-control: no-store|content-security-policy: default-src .none.)')"
expect "metrics without secret -> 401" 401 "$(code "$B/api/metrics")"
expect "metrics with secret -> counts requests" yes "$(curl -s "$B/api/metrics" -H "authorization: Bearer $METRICS_SECRET" | grep -q "^http_requests_total" && echo yes)"
expect "no EIN in server log" 0 "$(grep -c 12-3456789 "$WORK/server.log")"
[ $FAIL -eq 0 ] && echo "e2e-web: OK" || { echo "e2e-web: FAILED"; exit 1; }
