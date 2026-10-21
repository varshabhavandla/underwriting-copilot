#!/usr/bin/env bash
# The single completion check for agents and CI. Exit 0 means the change is verified.
set -euo pipefail
cd "$(dirname "$0")/.."
npm run verify
echo "verify: OK"
