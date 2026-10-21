#!/usr/bin/env bash
# The single completion check for agents and CI. Exit 0 means the change is verified.
# Integration tests need a disposable Postgres: export UW_TEST_ADMIN_URL=postgres://postgres@127.0.0.1:54329/postgres
set -euo pipefail
cd "$(dirname "$0")/.."
if [ -z "${UW_TEST_ADMIN_URL:-}" ] && [ "${UW_ALLOW_NO_DB:-0}" != "1" ]; then
  echo "verify: UW_TEST_ADMIN_URL is not set, so database tests would be skipped. Set it, or set UW_ALLOW_NO_DB=1 to skip knowingly." >&2
  exit 2
fi
npm run verify
echo "verify: OK"
