#!/usr/bin/env bash
# Rebuilds the synthetic demo database and serves the app locally for a walkthrough (docs/DEMO_SCRIPT.md).
# Needs: UW_TEST_ADMIN_URL (disposable local Postgres superuser), psql, openssl. Synthetic data only.
set -euo pipefail
cd "$(dirname "$0")/.."
: "${UW_TEST_ADMIN_URL:?set UW_TEST_ADMIN_URL}"
PORT_WEB=${WEB_PORT:-3000}
npm run demo >/dev/null
DEMO_URL=$(echo "$UW_TEST_ADMIN_URL" | sed -E 's#/[^/]*$#/uw_demo#')
T=$(psql "$DEMO_URL" -tAq -c "select id from tenants limit 1")
U=$(psql "$DEMO_URL" -tAq -c "select id from users where role='underwriter' limit 1")
HP=$(echo "$UW_TEST_ADMIN_URL" | sed -E 's#^[a-z]+://([^@]*@)?([^/]+)/.*#\2#')
mkdir -p .demo-uploads
export DATABASE_URL="postgres://uw_app:uw_app_dev@$HP/uw_demo" DEV_TENANT_ID=$T DEV_USER_ID=$U UPLOAD_DIR="$PWD/.demo-uploads" \
  FIELD_KEY_MASTER=$(openssl rand -base64 32) WORKER_SECRET=demo-worker-secret-0123456789abcdef
# next dev, not next start: the app refuses the dev identity (DEV_TENANT_ID) when NODE_ENV is production, by design
echo "Demo ready: http://127.0.0.1:$PORT_WEB/  (review queue: /review, new application: /apply). Ctrl-C to stop."
exec npx next dev -p "$PORT_WEB"
