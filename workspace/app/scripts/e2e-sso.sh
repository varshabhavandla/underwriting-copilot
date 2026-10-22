#!/usr/bin/env bash
# Browser end-to-end check of per-organization single sign-on: two organizations, each with its own (fake) identity provider.
set -uo pipefail
cd "$(dirname "$0")/.."
if [ -z "${UW_TEST_ADMIN_URL:-}" ]; then echo "e2e-sso: set UW_TEST_ADMIN_URL" >&2; exit 2; fi
if [ -z "${PW_CHROMIUM:-}" ]; then
  PWBIN=$(node -e "console.log(require('playwright-core').chromium.executablePath())" 2>/dev/null || true)
  if [ ! -x "$PWBIN" ]; then
    if [ "${UW_ALLOW_NO_BROWSER:-0}" = "1" ]; then echo "e2e-sso: SKIPPED (no browser; skipped knowingly)"; exit 0; fi
    echo "e2e-sso: no Chromium found. Set PW_CHROMIUM=/path/to/chrome, run 'npx playwright-core install chromium', or set UW_ALLOW_NO_BROWSER=1 to skip knowingly." >&2; exit 2
  fi
fi
WORK="$(mktemp -d)"; trap 'kill -- -${SRV:-0} -${IDPA:-0} -${IDPB:-0} 2>/dev/null; rm -rf "$WORK"' EXIT
PA=${IDP_A_PORT:-4021}; PB=${IDP_B_PORT:-4022}; WEB_PORT=${WEB_SSO_PORT:-3130}
ISSA="http://127.0.0.1:$PA"; ISSB="http://127.0.0.1:$PB"; SA=$(openssl rand -hex 16); SB=$(openssl rand -hex 16)
HOSTPORT=$(echo "$UW_TEST_ADMIN_URL" | sed -E 's#^[a-z]+://([^@]*@)?([^/]+)/.*#\2#')
DB=uw_e2e_sso
SETUP=$(npx tsx scripts/setup-db.ts $DB 2>&1) || { echo "FAIL database setup: $SETUP"; exit 1; }
export FIELD_KEY_MASTER=$(openssl rand -base64 32) OWNER_DATABASE_URL="postgres://uw_owner:uw_owner_dev@$HOSTPORT/$DB"
CB="http://127.0.0.1:$WEB_PORT/api/auth/callback"
npx tsx scripts/provision-tenant.ts --name "Acme Bank" --slug acme --admin-email admin@acme.example --issuer "$ISSA" --client-id uw-a --client-secret "$SA" --admin-sub sub-admin > "$WORK/acme.txt" || { echo "FAIL provisioning acme"; exit 1; }
npx tsx scripts/provision-tenant.ts --name "Beta Bank" --slug beta --admin-email admin@beta.example --issuer "$ISSB" --client-id uw-b --client-secret "$SB" --admin-sub sub-admin > "$WORK/beta.txt" || { echo "FAIL provisioning beta"; exit 1; }
setsid npx tsx scripts/fake-idp.ts "$PA" uw-a "$SA" "$CB" sub-admin:Admin sub-viewer:Viewer > "$WORK/idpa.log" 2>&1 & IDPA=$!
setsid npx tsx scripts/fake-idp.ts "$PB" uw-b "$SB" "$CB" sub-admin:Admin > "$WORK/idpb.log" 2>&1 & IDPB=$!
for _ in $(seq 1 30); do curl -s -o /dev/null "$ISSA/.well-known/openid-configuration" && curl -s -o /dev/null "$ISSB/.well-known/openid-configuration" && break; sleep 1; done
mkdir -p "$WORK/uploads"
# no DEV_TENANT_ID and no OIDC_* settings: only per-organization sign-in exists
export DATABASE_URL="postgres://uw_app:uw_app_dev@$HOSTPORT/$DB" UPLOAD_DIR="$WORK/uploads" SSO_MODE=per_tenant APP_ORIGIN="http://127.0.0.1:$WEB_PORT"
setsid node_modules/.bin/next dev -p "$WEB_PORT" > "$WORK/server.log" 2>&1 & SRV=$!
for _ in $(seq 1 90); do curl -s -o /dev/null "http://127.0.0.1:$WEB_PORT/api/health" && break; sleep 1; done
[ -n "${E2E_CURL:-}" ] && { curl -s -i -m 20 "http://127.0.0.1:$WEB_PORT/api/auth/login?org=acme" | head -12 | cut -c1-200; tail -5 "$WORK/server.log" | cut -c1-300; exit 3; }
E2E_BASE="http://127.0.0.1:$WEB_PORT" E2E_ISSA="$ISSA" E2E_ISSB="$ISSB" E2E_SECRET_A="$SA" E2E_SECRET_B="$SB" E2E_TENANT_A=$(sed -n 's/^TENANT=//p' "$WORK/acme.txt") \
  E2E_DB="$(echo "$UW_TEST_ADMIN_URL" | sed -E "s#/[^/]*\$#/$DB#")" E2E_LOG="$WORK/server.log" node scripts/e2e-sso.mjs
RC=$?
[ $RC -ne 0 ] && { echo "--- sign-in and error log lines:"; grep -h '"sign-in\|"level":"error"' "$WORK/server.log" | tail -8 | cut -c1-400; grep -h -i "error" "$WORK/server.log" | grep -v '^{' | tail -5 | cut -c1-300; }
[ $RC -eq 0 ] && echo "e2e-sso: OK" || echo "e2e-sso: FAILED"
exit $RC
