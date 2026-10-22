# Document uploads: what is accepted, checked and kept

Status 2026-10-22. Implements ASVS V5.1.1 (documented upload rules) and hardens V5.2.2, V5.4.3, V1.3.4 (B-146). Tests: `app/test/unit/uploads.test.ts`, `scripts/e2e-web.sh`.

## Accepted
| Detected content | Name must end with | Notes |
|---|---|---|
| PDF (`%PDF-`) | `.pdf` | refused if it contains active content (see below); stored and routed to manual review (no OCR yet) |
| PNG | `.png` | stored; manual review |
| JPEG | `.jpg`, `.jpeg` | stored; manual review |
| Plain UTF-8 text | `.txt`, `.csv` | the only type the mock extractor reads; markup is refused |
Everything else is refused (415). The type is decided from the bytes; the name is then compared with it, so `report.pdf.exe`, an executable named `.pdf` and a PDF named `.png` are all refused. Maximum 4 MB (below the 4.5 MB hosting limit; production uploads will go directly to storage, B-126). Archives and office formats are not accepted, so there is no unpacking and no decompression-bomb surface.

## Refused even when the type is allowed
- **Active PDFs:** names that run code or reach out: JavaScript, JS, Launch, OpenAction, AA, RichMedia, EmbeddedFile(s), XFA, SubmitForm, ImportData, GoToR, GoToE. PDF name escapes (`/J#61vaScript`) are decoded first so they cannot hide a name. Ordinary hyperlinks (`/URI`) are allowed. A genuine statement with an embedded script is therefore refused and must be re-exported; that trade is deliberate.
- **Markup disguised as text:** a text file that starts with `<` or contains `<script`, `<svg`, `<iframe`, `<object`, `<embed`, `<html` or a doctype in its first 64 KB. A text statement that begins with a `<` is refused too (conservative).

## Malware scan
Every accepted file is scanned before it is stored, through the ClamAV daemon's INSTREAM protocol (`CLAMD_HOST`, `CLAMD_PORT`). Framing (a 4-byte network-order length before each chunk, a zero-length chunk to end, the `z` command prefix, the size limit) was checked against the clamd manual page [V, S-56]; the reply strings `stream: OK` and `... FOUND` are assumed [A] and must be verified against a real daemon (B-155). The client treats any other reply as "scanner unavailable".
- Infected: 422, nothing stored, a `document.rejected` audit event with the signature name, metric `uploads_rejected_total{reason="malware"}`.
- Scanner down, slow or confused: 503 with `Retry-After: 30`, nothing stored (fails closed), metric `reason="scanner_unavailable"`.
- Production refuses to start without `CLAMD_HOST`. Local development without it uses a stand-in that says "clean" and is clearly named `none`.
- Not tested against a real ClamAV: the tests and the end-to-end run use a protocol stand-in (`test/support/fakeClamd.ts`) that recognizes only the standard EICAR test string. Signature freshness is not monitored (B-155).

## Stored and served
Stored encrypted under the tenant's key at a key built only from tenant, case and content hash (no uploader-supplied path or name). The file name is not kept. There is no download route yet. The future source-document viewer (B-129) must use `src/storage/download.ts`: always an attachment, content type from our own detection (never the uploader's), `nosniff`, a sandboxing policy, and a sanitized name.

## Residual risks
Only known signatures are caught; a novel or targeted file will pass. Images are not re-encoded, so a crafted image is stored as received. PDFs are not parsed beyond the name scan (the real OCR step, B-125, must run in an isolated, resource-limited worker). Document text is treated as untrusted data at every later step (AGENTS.md).
