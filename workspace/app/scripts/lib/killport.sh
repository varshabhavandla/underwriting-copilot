# Stops whatever is listening on the given TCP ports (dev servers spawn children that escape a plain kill of the launcher). Needs lsof; does nothing without it.
killport() { command -v lsof >/dev/null 2>&1 || return 0; for port in "$@"; do [ -n "$port" ] && for pid in $(lsof -t -iTCP:"$port" -sTCP:LISTEN 2>/dev/null); do kill "$pid" 2>/dev/null; done; done; return 0; }
