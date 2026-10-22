#!/usr/bin/env bash
# Rebuilds the synthetic demo database and serves the app locally for a walkthrough (docs/DEMO_SCRIPT.md).
# Needs: UW_TEST_ADMIN_URL (disposable local Postgres superuser), psql, openssl. Synthetic data only.
set -euo pipefail
cd "$(dirname "$0")/.."
: "${UW_TEST_ADMIN_URL:?set UW_TEST_ADMIN_URL}"
PORT_WEB=${WEB_PORT:-3000}
npm run demo >/dev/null
DEMO_URL=$(echo "$UW_TEST_ADMIN_URL" | sed -E 's#/[^/]*$#/uw_demo#')
HP=$(echo "$UW_TEST_ADMIN_URL" | sed -E 's#^[a-z]+://([^@]*@)?([^/]+)/.*#\2#')
IDP_PORT=${IDP_PORT:-4010}; ISS="http://127.0.0.1:$IDP_PORT"; SECRET=$(openssl rand -hex 16)
npx tsx scripts/seed-staff.ts uw_demo "$ISS" >/dev/null
mkdir -p .demo-uploads
# Sign-in uses the local fake identity provider (development only): pick Admin, Processor, Underwriter or Viewer on its page.
trap 'kill -- -${IDP:-0} 2>/dev/null' EXIT
setsid npx tsx scripts/fake-idp.ts "$IDP_PORT" uw-client "$SECRET" "http://127.0.0.1:$PORT_WEB/api/auth/callback" sub-admin:Admin sub-processor:Processor sub-underwriter:Underwriter sub-viewer:Viewer > /dev/null 2>&1 & IDP=$!
export DATABASE_URL="postgres://uw_app:uw_app_dev@$HP/uw_demo" UPLOAD_DIR="$PWD/.demo-uploads" FIELD_KEY_MASTER=$(openssl rand -base64 32) WORKER_SECRET=demo-worker-secret-0123456789abcdef \
  OIDC_ISSUER="$ISS" OIDC_CLIENT_ID=uw-client OIDC_CLIENT_SECRET="$SECRET" OIDC_REDIRECT_URI="http://127.0.0.1:$PORT_WEB/api/auth/callback"
# next dev, not next start: production mode requires https identity-provider URLs and refuses the development fake provider setup, by design
echo "Demo ready: http://127.0.0.1:$PORT_WEB/  (you will be sent to the fake sign-in page; choose a role). Ctrl-C to stop."
npx next dev -p "$PORT_WEB"
