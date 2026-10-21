#!/usr/bin/env bash
# The single completion check for agents and CI. Exit 0 means the change is verified.
set -euo pipefail
cd "$(dirname "$0")/.."
export PYTHONPATH=src
python3 -m compileall -q src scripts tests
python3 -m unittest discover -s tests -v
python3 scripts/run_evals.py
echo "verify: OK"
