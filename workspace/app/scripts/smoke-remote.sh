#!/usr/bin/env bash
# Black-box smoke test of a deployed instance: no credentials, no data written. Usage: scripts/smoke-remote.sh https://your-app.example.com
# Set SMOKE_ALLOW_HTTP=1 to allow http (local servers only). Exit 1 on any failure.
set -uo pipefail
BASE="${1:?usage: smoke-remote.sh <base url>}"; BASE="${BASE%/}"
case "$BASE" in https://*) ;; http://*) [ "${SMOKE_ALLOW_HTTP:-0}" = 1 ] || { echo "refusing plain http (set SMOKE_ALLOW_HTTP=1 for local servers)"; exit 2; } ;; *) echo "base url must start with https://"; exit 2 ;; esac
FAIL=0
ok() { echo "ok   $1"; }
bad() { echo "FAIL $1: $2"; FAIL=1; }
eq() { [ "$2" = "$3" ] && ok "$1" || bad "$1" "expected [$2] got [$3]"; }
status() { curl -s -o /dev/null -w "%{http_code}" -m 20 "$@"; }
hdrs() { curl -s -D - -o /dev/null -m 20 "$@" | tr -d '\r' | tr 'A-Z' 'a-z'; }
has() { echo "$2" | grep -q "^$1" && ok "$3" || bad "$3" "header $1 missing"; }

eq "health answers 200" 200 "$(status "$BASE/api/health")"
H=$(hdrs "$BASE/api/health")
has "x-content-type-options: nosniff" "$H" "nosniff on api responses"
has "x-frame-options: deny" "$H" "frame denial on api responses"
has "strict-transport-security: max-age=63072000" "$H" "HSTS on api responses"
has "cache-control: no-store" "$H" "no-store on api responses"
has "content-security-policy: default-src 'none'" "$H" "api content security policy"
has "x-request-id:" "$H" "request id on responses"
echo "$H" | grep -q "^set-cookie" && bad "no cookie is set to anonymous callers" "a cookie was set" || ok "no cookie is set to anonymous callers"
echo "$H" | grep -q "^x-powered-by" && bad "framework banner is hidden" "x-powered-by present" || ok "framework banner is hidden"
eq "a supplied request id is echoed" "rid-smoke-1234" "$(curl -s -D - -o /dev/null -m 20 -H 'x-request-id: rid-smoke-1234' "$BASE/api/health" | tr -d '\r' | awk -F': ' 'tolower($1)=="x-request-id"{print $2}')"

R=$(status "$BASE/review"); case "$R" in 301|302|303|307|308) ok "anonymous /review redirects ($R)";; *) bad "anonymous /review redirects" "got $R";; esac
LOC=$(curl -s -D - -o /dev/null -m 20 "$BASE/review" | tr -d '\r' | awk -F': ' 'tolower($1)=="location"{print $2}')
echo "$LOC" | grep -qE "/signin|/api/auth/login" && ok "and goes to sign-in" || bad "and goes to sign-in" "location [$LOC]"
eq "the sign-in page is public" 200 "$(status "$BASE/signin")"
eq "the no-access page is public" 200 "$(status "$BASE/forbidden")"
PH=$(hdrs "$BASE/signin")
has "content-security-policy: frame-ancestors 'none'" "$PH" "pages forbid framing"
has "referrer-policy: same-origin" "$PH" "referrer policy lets forms carry an origin"

eq "anonymous API write is refused (401)" 401 "$(status -X POST -H 'content-type: application/json' -d '{}' "$BASE/api/applications")"
eq "anonymous decision is refused (401)" 401 "$(status -X POST -H 'content-type: application/json' -d '{}' "$BASE/api/cases/00000000-0000-4000-8000-000000000000/decision")"
eq "a form post to a JSON route is refused (415)" 415 "$(status -X POST -d 'a=1' "$BASE/api/applications")"
M=$(status "$BASE/api/metrics"); case "$M" in 401|404) ok "metrics are not public ($M)";; *) bad "metrics are not public" "got $M";; esac
W=$(status -X POST "$BASE/api/outbox/deliver"); case "$W" in 401|404) ok "the delivery worker is not public ($W)";; *) bad "the delivery worker is not public" "got $W";; esac
eq "logout from another origin is refused" 403 "$(status -X POST -H 'origin: https://evil.example' "$BASE/api/auth/logout")"
eq "an unknown path is a plain 404" 404 "$(status "$BASE/no-such-page")"
CB=$(status "$BASE/api/auth/callback?code=x&state=y"); case "$CB" in 302|307|404) ok "a callback with no sign-in in progress is refused ($CB)";; *) bad "a callback with no sign-in in progress is refused" "got $CB";; esac
echo "$([ $FAIL -eq 0 ] && echo 'smoke-remote: OK' || echo 'smoke-remote: FAILED')"; exit $FAIL
