#!/usr/bin/env bash
# End-to-end check of the running web app against a fresh local database. Exits non-zero on the first mismatch.
# Needs: UW_TEST_ADMIN_URL (disposable Postgres superuser), psql, curl, openssl.
set -uo pipefail
cd "$(dirname "$0")/.."
: "${UW_TEST_ADMIN_URL:?set UW_TEST_ADMIN_URL}"
WORK="$(mktemp -d)"; trap 'kill ${SRV:-0} 2>/dev/null; rm -rf "$WORK"' EXIT
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
export DATABASE_URL="postgres://uw_app:uw_app_dev@$H:$PORT/$DB" DEV_TENANT_ID=$T DEV_USER_ID=$U UPLOAD_DIR="$WORK/uploads" FIELD_KEY_MASTER=$(openssl rand -base64 32)
WEB_PORT=${WEB_PORT:-3110}
node_modules/.bin/next dev -p "$WEB_PORT" > "$WORK/server.log" 2>&1 & SRV=$!
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
expect "invalid json -> 400" 400 "$(code -X POST "$B/api/applications" -d '{nope')"
expect "oversized body -> 413" 413 "$(head -c 70000 /dev/zero | tr '\0' 'a' | code -X POST "$B/api/applications" -H "$J" --data-binary @-)"

printf 'Net income: $210,000.00\nRevenue: $1,200,000.00\nAs of: 2026-09-30\nTotal assets: $500,000.00\nTotal liabilities: $300,000.00\nTotal equity: $200,000.00\n' > "$WORK/fs.txt"
R=$(curl -s -w "\n%{http_code}" -F "file=@$WORK/fs.txt" -F docType=financial_statement "$B/api/applications/$CASE/documents")
expect "text financial statement -> 201" 201 "$(echo "$R" | tail -1)"; expect "6 facts accepted" 1 "$(echo "$R" | head -1 | grep -c '"factsAccepted":6')"
expect "same file again -> 200 and skipped" 200 "$(code -F "file=@$WORK/fs.txt" -F docType=financial_statement "$B/api/applications/$CASE/documents")"
printf 'MZ\x90\x00\x03\x00\x00\x00' > "$WORK/evil.pdf"; expect "executable named .pdf -> 415" 415 "$(code -F "file=@$WORK/evil.pdf" -F docType=bank_statement "$B/api/applications/$CASE/documents")"
printf '%%PDF-1.7\n1 0 obj<<>>endobj\n' > "$WORK/real.pdf"; expect "real pdf -> 202 manual review" 202 "$(code -F "file=@$WORK/real.pdf" -F docType=bank_statement "$B/api/applications/$CASE/documents")"
expect "unknown case -> 404" 404 "$(code -F "file=@$WORK/fs.txt" -F docType=financial_statement "$B/api/applications/00000000-0000-4000-8000-000000000000/documents")"
expect "bad docType -> 400" 400 "$(code -F "file=@$WORK/fs.txt" -F docType=passport "$B/api/applications/$CASE/documents")"
expect "apply page renders" 1 "$(curl -s "$B/apply" | grep -c 'Synthetic data only')"
expect "health ok" 200 "$(code "$B/api/health")"
RB=$(curl -s -w "\n%{http_code}" -X POST "$B/api/cases/$CASE/build"); expect "build file -> 200" 200 "$(echo "$RB" | tail -1)"
expect "memo stored and verified" 1 "$(echo "$RB" | head -1 | grep -c '"memoStored":true')"
expect "case left in needs_review, never approved" 1 "$(echo "$RB" | head -1 | grep -c '"status":"needs_review"')"
expect "build on an unknown case -> 404" 404 "$(code -X POST "$B/api/cases/00000000-0000-4000-8000-000000000000/build")"

expect "one application stored" 1 "$(psqlx -c "select count(*) from applications")"
expect "EIN is not plaintext in the database" 0 "$(psqlx -c "select count(*) from applications where encode(ein_ciphertext,'escape') like '%3456789%'")"
expect "only last4 stored in the clear" 6789 "$(psqlx -c "select ein_last4 from applications")"
expect "6 accepted facts, all cited" 6 "$(psqlx -c "select count(*) from facts where case_id='$CASE' and status='accepted' and page=1 and length(passage)>0")"
expect "manual-review exception for the pdf" 1 "$(psqlx -c "select count(*) from exceptions where case_id='$CASE' and kind='ocr_required'")"
expect "rule run recorded with 11 results and one verified memo" "1 11 1" "$(psqlx -c "select (select count(*) from rule_runs where case_id='$CASE')||' '||(select count(*) from rule_results where case_id='$CASE')||' '||(select count(*) from memos where case_id='$CASE')")"
expect "missing documents are flagged by rule" 1 "$(psqlx -c "select count(*) from exceptions where case_id='$CASE' and kind='rule:required-documents'")"
expect "case status is needs_review" needs_review "$(psqlx -c "select status from cases where id='$CASE'")"
expect "2 stored objects, none readable as plaintext" "2 0" "$(echo "$(find "$WORK/uploads" -type f | wc -l) $(grep -rl 'Net income' "$WORK/uploads" | wc -l)")"
CH=$(PGPASSWORD=uw_app_dev psql -h "$H" -p "$PORT" -U uw_app -d $DB -tAq -c "select set_config('app.tenant_id','$T',false)" -c "select coalesce(audit_verify_chain()::text,'intact')" | tail -1)
expect "audit chain verifies" intact "$CH"
expect "no EIN in server log" 0 "$(grep -c 12-3456789 "$WORK/server.log")"
[ $FAIL -eq 0 ] && echo "e2e-web: OK" || { echo "e2e-web: FAILED"; exit 1; }
