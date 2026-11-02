#!/usr/bin/env bash
# Browser end-to-end check of sign-in, roles, sessions and sign-out against the fake identity provider (development only).
# Needs: UW_TEST_ADMIN_URL, a Chromium (PW_CHROMIUM=/path/to/chrome, or Playwright's own install), psql not required.
set -uo pipefail
cd "$(dirname "$0")/.."; . scripts/lib/killport.sh; . scripts/lib/devserver.sh; . scripts/lib/bgstart.sh
cd "$(dirname "$0")/.."
if [ -z "${UW_TEST_ADMIN_URL:-}" ]; then echo "e2e-auth: set UW_TEST_ADMIN_URL" >&2; exit 2; fi
if [ -z "${PW_CHROMIUM:-}" ]; then
  PWBIN=$(node -e "console.log(require('playwright-core').chromium.executablePath())" 2>/dev/null || true)
  if [ ! -x "$PWBIN" ]; then
    if [ "${UW_ALLOW_NO_BROWSER:-0}" = "1" ]; then echo "e2e-auth: SKIPPED (no browser; skipped knowingly)"; exit 0; fi
    echo "e2e-auth: no Chromium found. Set PW_CHROMIUM=/path/to/chrome, run 'npx playwright-core install chromium', or set UW_ALLOW_NO_BROWSER=1 to skip knowingly." >&2; exit 2
  fi
fi
WORK="$(mktemp -d)"; trap 'for p in ${SRV:-} ${IDP:-}; do kill -- -$p 2>/dev/null; done; killport "$WEB_PORT" "$IDP_PORT"; rm -rf "$WORK"' EXIT  # servers run in their own process groups so their children die too
IDP_PORT=${IDP_PORT:-4010}; WEB_PORT=${WEB_AUTH_PORT:-3120}
ISS="http://127.0.0.1:$IDP_PORT"; CLIENT=uw-client; SECRET=$(openssl rand -hex 16)
HOSTPORT=$(echo "$UW_TEST_ADMIN_URL" | sed -E 's#^[a-z]+://([^@]*@)?([^/]+)/.*#\2#')
SETUP=$(SETUP_ISSUER=$ISS npx tsx scripts/setup-db.ts uw_e2e_auth 2>&1) || { echo "FAIL database setup: $SETUP"; exit 1; }
T=$(echo "$SETUP" | sed -n 's/^TENANT=//p')
mkdir -p "$WORK/uploads"
bgstart npx tsx scripts/fake-idp.ts "$IDP_PORT" "$CLIENT" "$SECRET" "http://127.0.0.1:$WEB_PORT/api/auth/callback" sub-admin:Admin sub-processor:Processor sub-underwriter:Underwriter sub-viewer:Viewer sub-stranger:Stranger sub-newbie:Newbie > "$WORK/idp.log" 2>&1 & IDP=$!
for _ in $(seq 1 30); do curl -s -o /dev/null "$ISS/.well-known/openid-configuration" && break; sleep 1; done
# note: no DEV_TENANT_ID. With OIDC configured only a session counts.
export DATABASE_URL="postgres://uw_app:uw_app_dev@$HOSTPORT/uw_e2e_auth" UPLOAD_DIR="$WORK/uploads" FIELD_KEY_MASTER=$(openssl rand -base64 32) \
  OIDC_ISSUER="$ISS" OIDC_CLIENT_ID="$CLIENT" OIDC_CLIENT_SECRET="$SECRET" OIDC_REDIRECT_URI="http://127.0.0.1:$WEB_PORT/api/auth/callback" OIDC_REQUIRED_AMR=mfa
fresh_next; bgstart node_modules/.bin/next dev -p "$WEB_PORT" > "$WORK/server.log" 2>&1 & SRV=$!
for _ in $(seq 1 90); do curl -s -o /dev/null "http://127.0.0.1:$WEB_PORT/api/health" && break; sleep 1; done
curl -s -o /dev/null "http://127.0.0.1:$WEB_PORT/api/health" || { echo "--- the web server did not answer in time; the tail of its log:"; tail -40 "$WORK/server.log"; }
E2E_BASE="http://127.0.0.1:$WEB_PORT" E2E_IDP="$ISS" E2E_TENANT="$T" E2E_DB="$(echo "$UW_TEST_ADMIN_URL" | sed -E 's#/[^/]*$#/uw_e2e_auth#')" E2E_LOG="$WORK/server.log" node scripts/e2e-auth.mjs
RC=$?
[ $RC -ne 0 ] && { echo "--- sign-in log lines:"; grep -h '"sign-in' "$WORK/server.log" | tail -5; echo "--- idp log:"; tail -3 "$WORK/idp.log"; }
[ $RC -eq 0 ] && echo "e2e-auth: OK" || echo "e2e-auth: FAILED"
exit $RC
