# MVP workflow

Upload packet -> extract facts with citations -> flag missing/conflicting info -> run one
approved checklist -> draft case memo -> reviewer approves or corrects.

| Step | Who/what | Evidence kept |
|---|---|---|
| Intake | code | files, hashes, timestamps, missing-item list |
| Extraction | model (later) | doc version, page, passage, uncertainty note |
| Reconciliation | code (`find_conflicts`) | both conflicting facts + status |
| Checklist | code (`policy.evaluate`) | policy version, inputs, outcome per rule |
| Memo | model (later) | source citation for each material statement |
| Decision | underwriter | reviewer, policy version, reasons, overrides |

Built now: intake check, reconciliation, injection flagging, checklist, tenancy/decision store.
Not built: extraction, storage, memo, UI, auth. Each needs its own ticket with acceptance criteria.

## Fixture matrix (synthetic)
complete, missing doc, contradictory name, instruction-injection in a document, over-limit amount, conflicting amount.
Add: scanned/illegible page, duplicate upload, stale document version, same name different person.
