# Walkthrough report

Run 2026-10-23T20:59:02.203Z on a fresh local stack (database, fake identity provider, web app). Synthetic data only. Screenshots are in this folder.

| # | Step | Result |
|---|---|---|
| 1 | processor signs in through the identity provider | pass |
| 2 | underwriter signs in through the identity provider | pass |
| 3 | viewer signs in through the identity provider | pass |
| 4 | admin signs in through the identity provider | pass |
| 5 | processor submits the application form for clean (Copper Dental Group PC) | pass |
| 6 | clean: 6 documents uploaded through the case page, processed in the background, and shown live without a reload | pass |
| 7 | clean: file built from the case page (rules run, memo drafted, nothing approved) | pass |
| 8 | processor submits the application form for arith (Granite Dental Group PC) | pass |
| 9 | arith: 6 documents uploaded through the case page, processed in the background, and shown live without a reload | pass |
| 10 | arith: file built from the case page (rules run, memo drafted, nothing approved) | pass |
| 11 | processor submits the application form for injection (Harbor Plumbing LLC) | pass |
| 12 | injection: 6 documents uploaded through the case page, processed in the background, and shown live without a reload | pass |
| 13 | injection: file built from the case page (rules run, memo drafted, nothing approved) | pass |
| 14 | the queue lists all three businesses with their open exceptions | pass |
| 15 | processor cannot record a decision (403) | pass |
| 16 | viewer can read the file but sees no decision form | pass |
| 17 | clean file: facts, rule results, memo and open items are all on the page | pass |
| 18 | clean file: every accepted fact shows a source passage | pass |
| 19 | underwriter adopts the memo draft | pass |
| 20 | underwriter disposes the open exceptions with notes (1) | pass |
| 21 | underwriter approves the clean file | pass |
| 22 | arithmetic-error file shows the planted exception | pass |
| 23 | approving with an open high-severity exception and no override is refused | pass |
| 24 | underwriter declines it with written reasons | pass |
| 25 | injected-instruction file is flagged critical and its facts were held for review | pass |
| 26 | approval with a written override is recorded | pass |
| 27 | delivery run sends the three decision events and nothing fails | pass |
| 28 | queue shows 2 handed_off and 1 declined | pass |
| 29 | security events show four sign-ins | pass |
| 30 | underwriter sees their own session | pass |
| 31 | three decisions recorded, all by an underwriter, with reasons | pass |
| 32 | only the injected-instruction approval carries an override | pass |
| 33 | the tamper-evident audit chain verifies | pass |
| 34 | every stored fact has a source passage (102 facts) | pass |
| 35 | a verified memo draft exists for each file | pass |
| 36 | 18 stored documents, none readable as plaintext | pass |
| 37 | EIN is stored encrypted with only the last four digits in the clear | pass |
| 38 | the server log holds no EIN and no business name | pass |
| 39 | clicking Sign out lands on a plain signed-out page (no redirect chain) | pass |
| 40 | after signing out, protected pages send the browser back to the identity provider | pass |

## Gaps noticed while running it
- browser error: Processor: Failed to load resource: the server responded with a status of 404 (Not Found)
- browser error: Processor: Failed to load resource: the server responded with a status of 403 (Forbidden)
