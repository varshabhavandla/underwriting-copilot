#!/usr/bin/env bash
# Runs the whole lending workflow in a real browser against a fresh local stack (database, fake identity provider, web app), as each role, and writes
# screenshots and a report to ../demo/walkthrough/. Synthetic data only.
set -uo pipefail
cd "$(dirname "$0")/.."; . scripts/lib/killport.sh
if [ -z "${UW_TEST_ADMIN_URL:-}" ]; then echo "walkthrough: set UW_TEST_ADMIN_URL" >&2; exit 2; fi
if [ -z "${PW_CHROMIUM:-}" ]; then
  PWBIN=$(node -e "console.log(require('playwright-core').chromium.executablePath())" 2>/dev/null || true)
  [ -x "$PWBIN" ] || { echo "walkthrough: no Chromium. Set PW_CHROMIUM=/path/to/chrome" >&2; exit 2; }
fi
WORK="$(mktemp -d)"; trap 'for p in ${SRV:-} ${IDP:-}; do kill -- -$p 2>/dev/null; done; killport "$WEB_PORT" "$IDP_PORT"; rm -rf "$WORK"' EXIT
IDP_PORT=${IDP_PORT:-4030}; WEB_PORT=${WEB_WALK_PORT:-3140}
ISS="http://127.0.0.1:$IDP_PORT"; SECRET=$(openssl rand -hex 16); WORKER=$(openssl rand -hex 16)
HOSTPORT=$(echo "$UW_TEST_ADMIN_URL" | sed -E 's#^[a-z]+://([^@]*@)?([^/]+)/.*#\2#'); DB=uw_walk
SETUP=$(SETUP_ISSUER=$ISS npx tsx scripts/setup-db.ts $DB 2>&1) || { echo "FAIL database setup: $SETUP"; exit 1; }
T=$(echo "$SETUP" | sed -n 's/^TENANT=//p')
npx tsx scripts/walkthrough-packets.ts "$WORK/packets.json" >/dev/null
mkdir -p "$WORK/uploads" ../demo/walkthrough
setsid npx tsx scripts/fake-idp.ts "$IDP_PORT" uw-client "$SECRET" "http://127.0.0.1:$WEB_PORT/api/auth/callback" sub-admin:Admin sub-processor:Processor sub-underwriter:Underwriter sub-viewer:Viewer > "$WORK/idp.log" 2>&1 & IDP=$!
for _ in $(seq 1 30); do curl -s -o /dev/null "$ISS/.well-known/openid-configuration" && break; sleep 1; done
export DATABASE_URL="postgres://uw_app:uw_app_dev@$HOSTPORT/$DB" UPLOAD_DIR="$WORK/uploads" FIELD_KEY_MASTER=$(openssl rand -base64 32) WORKER_SECRET="$WORKER" \
  OIDC_ISSUER="$ISS" OIDC_CLIENT_ID=uw-client OIDC_CLIENT_SECRET="$SECRET" OIDC_REDIRECT_URI="http://127.0.0.1:$WEB_PORT/api/auth/callback"
setsid node_modules/.bin/next dev -p "$WEB_PORT" > "$WORK/server.log" 2>&1 & SRV=$!
for _ in $(seq 1 90); do curl -s -o /dev/null "http://127.0.0.1:$WEB_PORT/api/health" && break; sleep 1; done
WALK_BASE="http://127.0.0.1:$WEB_PORT" WALK_TENANT="$T" WALK_WORKER="$WORKER" WALK_PACKETS="$WORK/packets.json" WALK_OUT="$PWD/../demo/walkthrough" \
  WALK_DB="$(echo "$UW_TEST_ADMIN_URL" | sed -E "s#/[^/]*\$#/$DB#")" WALK_LOG="$WORK/server.log" WALK_UPLOADS="$WORK/uploads" node scripts/walkthrough.mjs
RC=$?
[ $RC -ne 0 ] && { echo "--- server log (warnings, errors, last requests):"; grep -h '"level":"warn"\|"level":"error"\|Error\|⨯' "$WORK/server.log" | tail -12 | cut -c1-300; }
exit $RC
