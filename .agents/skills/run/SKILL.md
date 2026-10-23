---
name: run
description: Launch Underwriting Copilot locally and prove the app actually works end to end (sign-in, review console, a rendered case). USE WHEN asked to run, start, or test the app locally, or to confirm a change works for real rather than just in tests. NOT FOR the full test suite (use the verify skill) or writing new tests.
---

Needs `UW_TEST_ADMIN_URL` (disposable local Postgres superuser URL).

1. Check what's already up before starting anything: `lsof -iTCP -sTCP:LISTEN -P -n | grep -E ':3000|:4010'` (web, fake IDP) and `curl -s -o /dev/null -w '%{http_code}\n' http://127.0.0.1:3000/ --max-time 3`. A fresh `demo-up.sh` run reseeds the demo database, so don't restart it if an instance is already serving.
2. If nothing is up: `UW_TEST_ADMIN_URL=<url> bash workspace/app/scripts/demo-up.sh`. It blocks in the foreground running `next dev`; background it if you need the shell back, and wait for the "Demo ready" line before continuing.
3. No browser automation tool is normally available in this environment. Drive the real sign-in flow with `curl` and a cookie jar rather than assuming the app "probably works":
   - `curl -s -D - -o idp.html -c cookies.txt -L "http://127.0.0.1:3000/api/auth/login?returnTo=%2Freview"` — the redirect `location` header is the fake IDP's `/authorize?...` URL. It carries a fresh `state`/`nonce`/`code_challenge` every run, so capture it from this response rather than reusing one from a previous run.
   - Take that exact URL and append `&fake_sub=sub-underwriter` (or `sub-admin` / `sub-processor` / `sub-viewer`), then `curl -s -D - -o after_login.html -c cookies.txt -b cookies.txt -L "<that URL>"` to complete the OIDC callback signed in as that role.
   - Confirm `/review` rendered real case rows: `grep -oE 'href="/review/[^"]*"' after_login.html`.
   - Open one case (`curl -b cookies.txt -c cookies.txt http://127.0.0.1:3000/review/<id>`) and grep for `citation`, `exception`, `memo`, `needs_review`. Finding those strings is what proves the pipeline actually ran, not just that the page loaded. The decision status must read `needs_review` on a fresh case — anything else is a bug, since the pipeline never decides (AGENTS.md boundary 1).
4. If a real browser automation tool is available in this session, prefer it over curl — it exercises client-side rendering too, which curl can't.
