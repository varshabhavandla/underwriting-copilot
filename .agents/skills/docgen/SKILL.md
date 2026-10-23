---
name: docgen
description: Build or update one of the narrative docx/pdf documents in workspace/docs/ (project overview, business pitch, future ones) in this project's visual style. USE WHEN asked to create, edit, or regenerate one of these documents, or to make a new audience-specific version of one. NOT FOR code, for the diagrams used elsewhere, or for editing the raw .md docs directly.
---

Before writing content: confirm who the document is for and what they should do after reading it (internal notes for yourself, an internal approval ask, an external pitch to a prospective lender). Regenerating the same content for the wrong audience, twice, is the known failure mode here.

Build with `workspace/docs/docstyle.py`'s `DocBuilder` (`H`/`P`/`B`/`picture`/`page_break`/`save`) instead of hand-rolling python-docx setup, so every document keeps the same fonts, margins, and color palette (`NAVY`/`TEAL`/`SLATE`/`LIGHT`/`INK`). Reuse `img/workflow.png` and `img/architecture.png` (built by `build_overview.py`) rather than regenerating diagrams, unless the diagram itself needs to change.

After editing a build script:
1. `python3 <script>.py` to regenerate the `.docx`.
2. `python3 -c "import docstyle; print(docstyle.headings('<file>.docx'))"` to sanity-check the section list changed as intended, without opening the file.
3. `python3 -c "import docstyle; docstyle.convert_to_pdf('<file>.docx')"` (needs `soffice` on PATH) to regenerate the matching `.pdf`.
4. `open <file>.pdf` to preview it. If Preview doesn't visibly come to the front, the sandboxed Bash tool can swallow the GUI launch silently — retry the `open` call with the sandbox disabled, then `osascript -e 'tell application "Preview" to activate'`.

Keep one build script per document (`build_overview.py`, `build_pitch.py`, ...) rather than growing one script to cover multiple audiences via flags.
