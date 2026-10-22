# Demo script (10 minutes, local, synthetic data only)

Start: `cd workspace/app && UW_TEST_ADMIN_URL=<local postgres superuser url> bash scripts/demo-up.sh`, then open http://127.0.0.1:3000/review. You are sent to a fake sign-in page (a stand-in for a real identity provider): choose Underwriter. Sign in as Viewer or Processor in a private window to show that they cannot decide. The script rebuilds the demo database each run, so the demo is repeatable. It uses `next dev` on purpose: the app refuses the development identity in production mode.

Say first: all data is synthetic; the model provider is a mock; the tool prepares files and a human underwriter decides.

| Step | Do | Point to make |
|---|---|---|
| 0. Sign in (1 min) | Open /review, choose Underwriter on the fake provider page | Roles come from our database, not from the login provider. The viewer role sees files but cannot decide; sessions can be revoked at once; every sign-in is audited. |
| 1. Queue (1 min) | Open /review | Six prepared files, each with open exceptions by severity and a drafted memo. Status is needs_review for every file; software never approves. |
| 2. A flagged file (2 min) | Open Harbor Bakery LLC | One critical exception: a document contained instruction-like text (prompt injection). The tool held those facts for a human and did not obey the text. |
| 3. Rules with citations (1 min) | Scroll to rule results | 11 SBA rules, each with the SOP 50 10 section. Failures and unknowns go to a person; nothing passes silently. The tool lists 7 things it did not evaluate. |
| 4. Facts with sources (1 min) | Scroll to facts | Every figure carries the page and the quoted passage. Banner: accepted means faithfully extracted, not verified true. |
| 5. Memo (1 min) | Scroll to credit memo draft | Every line is cited and every number is checked against its source; the memo cannot contain approve or decline language. |
| 6. The human gate (2 min) | Try Approve with a reason only; then add a written override | First attempt is refused (open critical exception needs a recorded override). With the override it is recorded. The database enforces this, not the screen. |
| 7. Audit and handoff (1 min) | Scroll to audit trail; open the already-approved Prairie Dental file | Decision, reasons and override are in an append-only, hash-chained log. Only the approved file was handed to the mock servicing system. |
| 8. Intake (1 min) | Open /apply, submit a sample | Structured application in; EIN is encrypted, only the last four digits are shown. |

Known demo rough edges (say them before they are noticed): coverage ratios look unrealistically high because synthetic financials are generous; debt service uses only the new loan with a placeholder 9% rate; the sign-in provider is a local stand-in (the sign-in code is built to the OpenID Connect standard and tested, but no real provider is chosen); scanned PDFs are routed to manual review because OCR is not built; business names are random.

Reset: stop the server (Ctrl-C) and rerun the command.
