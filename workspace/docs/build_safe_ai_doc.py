"""Builds Safe_AI_for_Commercial_Loan_Underwriting.docx in the clean report style of the builder's NotebookLM reference
(accent rule on every page, bold title, light-blue summary box, zebra tables, bar bullets, page number footer).
Every claim is checked against this repository. Run from this folder: python3 build_safe_ai_doc.py
Reuses img/workflow.png and img/architecture.png from build_overview.py."""
import pathlib
from docx import Document
from docx.enum.text import WD_ALIGN_PARAGRAPH
from docx.oxml import OxmlElement
from docx.oxml.ns import qn
from docx.shared import Inches, Pt, RGBColor

here = pathlib.Path(__file__).parent
FONT = "Arial"
INK, MUT, ACC = "1F2937", "4B5A6B", "0B93D5"
HEAD, ZEBRA, LINE, BOXFILL, BOXLINE = "0F1B33", "F4F8FB", "DCE5EE", "E8F4FD", "9CCBEA"


def rgb(h): return RGBColor(int(h[0:2], 16), int(h[2:4], 16), int(h[4:6], 16))


def set_font(run_or_style, size=None, bold=None, color=None, italic=None):
    f = run_or_style.font
    f.name = FONT
    rpr = run_or_style.element.get_or_add_rPr() if hasattr(run_or_style, "element") and hasattr(run_or_style.element, "get_or_add_rPr") else run_or_style._element.get_or_add_rPr()
    rf = rpr.find(qn("w:rFonts"))
    if rf is None:
        rf = OxmlElement("w:rFonts"); rpr.append(rf)
    for a in ("w:ascii", "w:hAnsi", "w:cs", "w:eastAsia"): rf.set(qn(a), FONT)
    for a in ("w:asciiTheme", "w:hAnsiTheme", "w:cstheme", "w:eastAsiaTheme"):
        if rf.get(qn(a)) is not None: del rf.attrib[qn(a)]
    if size: f.size = Pt(size)
    if bold is not None: f.bold = bold
    if italic is not None: f.italic = italic
    if color: f.color.rgb = rgb(color)


def border(p_or_el, side, color, sz=6, space=4):
    ppr = p_or_el._p.get_or_add_pPr(); b = ppr.find(qn("w:pBdr"))
    if b is None:
        b = OxmlElement("w:pBdr"); ppr.append(b)
    e = OxmlElement(f"w:{side}")
    for k, v in (("val", "single"), ("sz", str(sz)), ("space", str(space)), ("color", color)): e.set(qn(f"w:{k}"), v)
    b.append(e)


def shade(cell, fill):
    tcPr = cell._tc.get_or_add_tcPr(); sh = OxmlElement("w:shd")
    for k, v in (("val", "clear"), ("color", "auto"), ("fill", fill)): sh.set(qn(f"w:{k}"), v)
    tcPr.append(sh)


def cell_margins(tbl, top=70, bottom=70, left=110, right=110):
    tblPr = tbl._tbl.tblPr; m = OxmlElement("w:tblCellMar")
    for side, v in (("top", top), ("left", left), ("bottom", bottom), ("right", right)):
        e = OxmlElement(f"w:{side}"); e.set(qn("w:w"), str(v)); e.set(qn("w:type"), "dxa"); m.append(e)
    tblPr.append(m)


def table_borders(tbl, sides, color, sz=4):
    tblPr = tbl._tbl.tblPr; b = OxmlElement("w:tblBorders")
    for side in ("top", "left", "bottom", "right", "insideH", "insideV"):
        e = OxmlElement(f"w:{side}")
        if side in sides:
            for k, v in (("val", "single"), ("sz", str(sz)), ("space", "0"), ("color", color)): e.set(qn(f"w:{k}"), v)
        else:
            e.set(qn("w:val"), "nil")
        b.append(e)
    tblPr.append(b)


d = Document()
sec = d.sections[0]
sec.left_margin = sec.right_margin = Inches(0.95); sec.top_margin = Inches(0.95); sec.bottom_margin = Inches(0.85)
sec.header_distance = Inches(0.45); sec.footer_distance = Inches(0.4)
set_font(d.styles["Normal"], 10, color=INK)
d.styles["Normal"].paragraph_format.line_spacing = 1.2

# title style: no default underline
t = d.styles["Title"]; set_font(t, 24, True, "111827")
ppr = t.element.get_or_add_pPr(); old = ppr.find(qn("w:pBdr"))
if old is not None: ppr.remove(old)
t.paragraph_format.space_after = Pt(10); t.paragraph_format.space_before = Pt(6)
h1 = d.styles["Heading 1"]; set_font(h1, 13.5, True, "111827")
h1.paragraph_format.space_before = Pt(16); h1.paragraph_format.space_after = Pt(5); h1.paragraph_format.keep_with_next = True
h2 = d.styles["Heading 2"]; set_font(h2, 11, True, "111827")
h2.paragraph_format.space_before = Pt(8); h2.paragraph_format.space_after = Pt(2); h2.paragraph_format.keep_with_next = True

# header rule and footer page number
hp = sec.header.paragraphs[0]; border(hp, "bottom", ACC, sz=12, space=1)
fp = sec.footer.paragraphs[0]; fp.alignment = WD_ALIGN_PARAGRAPH.RIGHT; border(fp, "top", LINE, sz=4, space=6)
r = fp.add_run("Page "); set_font(r, 8.5, color="6B7C93")
for tag, text in (("begin", None), (None, "PAGE"), ("end", None)):
    run = fp.add_run(); set_font(run, 8.5, color="6B7C93")
    if tag:
        el = OxmlElement("w:fldChar"); el.set(qn("w:fldCharType"), tag); run._r.append(el)
    else:
        el = OxmlElement("w:instrText"); el.set(qn("xml:space"), "preserve"); el.text = text; run._r.append(el)


def H1(txt): d.add_heading(txt, level=1)
def H2(txt): d.add_heading(txt, level=2)


def P(txt, after=6, size=10, color=INK):
    p = d.add_paragraph(); r = p.add_run(txt); set_font(r, size, color=color)
    p.paragraph_format.space_after = Pt(after); return p


def bullets(items):
    for it in items:
        p = d.add_paragraph(); border(p, "left", ACC, sz=18, space=8)
        p.paragraph_format.left_indent = Inches(0.2); p.paragraph_format.space_after = Pt(4)
        if isinstance(it, tuple):
            r = p.add_run(it[0]); set_font(r, 10, True, INK); r = p.add_run(it[1]); set_font(r, 10, color=INK)
        else:
            r = p.add_run(it); set_font(r, 10, color=INK)


def box(lead, text, items=None):
    t = d.add_table(rows=1, cols=1); table_borders(t, ("top", "left", "bottom", "right"), BOXLINE, 6); cell_margins(t, 110, 110, 160, 160)
    c = t.rows[0].cells[0]; shade(c, BOXFILL); c.text = ""
    p = c.paragraphs[0]; r = p.add_run(lead + " "); set_font(r, 9.5, True, INK)
    r = p.add_run(text); set_font(r, 9.5, color=INK)
    for it in items or []:
        q = c.add_paragraph(); border(q, "left", ACC, sz=18, space=8); q.paragraph_format.left_indent = Inches(0.2); q.paragraph_format.space_after = Pt(2)
        r = q.add_run(it); set_font(r, 9.5, color=INK)
    sp = d.add_paragraph(); sp.paragraph_format.space_after = Pt(2)


def table(headers, rows, widths):
    t = d.add_table(rows=1, cols=len(headers)); t.autofit = False
    table_borders(t, ("bottom", "insideH"), LINE, 4); cell_margins(t, 50, 50, 110, 110)
    for i, h in enumerate(headers):
        c = t.rows[0].cells[i]; c.text = ""; shade(c, HEAD)
        r = c.paragraphs[0].add_run(h); set_font(r, 9, True, "FFFFFF"); c.paragraphs[0].paragraph_format.space_after = Pt(0)
    for k, row in enumerate(rows):
        cells = t.add_row().cells
        for i, v in enumerate(row):
            cells[i].text = ""
            if k % 2 == 1: shade(cells[i], ZEBRA)
            r = cells[i].paragraphs[0].add_run(v); set_font(r, 9, i == 0, INK)
            cells[i].paragraphs[0].paragraph_format.line_spacing = 1.1; cells[i].paragraphs[0].paragraph_format.space_after = Pt(0)
    for i, w in enumerate(widths): t.columns[i].width = Inches(w)
    for k, row in enumerate(t.rows):
        trPr = row._tr.get_or_add_trPr(); trPr.append(OxmlElement("w:cantSplit"))
        if k == 0: trPr.append(OxmlElement("w:tblHeader"))
        for i, w in enumerate(widths): row.cells[i].width = Inches(w)
    sp = d.add_paragraph(); sp.paragraph_format.space_after = Pt(2)


d.add_paragraph("Safe AI for Commercial Loan Underwriting", style="Title")
P("Reference Architecture & Compliance Overview: Underwriting Copilot", size=11, color=ACC, after=8)
box("Executive Summary:",
    "Underwriting Copilot is an AI-assisted commercial loan preparation platform designed for SBA 7(a) and commercial lenders. It aims to reduce manual file assembly "
    "while enforcing deterministic rules, strict human-in-the-loop decisioning, sourced figures and tamper-evident auditing.")

H1("1. The Operational Challenge in Commercial Lending")
P("Commercial loan underwriting traditionally demands hours of manual file preparation before credit risk assessment can even begin. Underwriters spend significant time "
  "reading tax returns, financial statements and bank records, manually keying figures into spreadsheets, verifying reconciliation, matching compliance criteria against complex "
  "government regulations (for example SBA SOP 50 10), and drafting credit memos.")
P("This manual preparation phase is where human errors, such as missed document anomalies or mistyped figures, frequently occur. Underwriting Copilot automates file assembly so "
  "underwriters receive prepared loan files, with problems already flagged, ready for their review. The time saved is our hypothesis and has not been measured on real files.")

H1("2. Architectural Pillars of Safe AI")
P("Unlike black-box generative AI models that produce unverified summaries or risk autonomous errors, Underwriting Copilot uses a rules-first, safety-first architecture "
  "built around five pillars:")
bullets([("Database-Level Human-in-the-Loop Enforcement: ",
          "The system cannot approve, decline or rank borrowers autonomously. The human-decision requirement is enforced by database rules, so errors in application code or "
          "external integrations cannot record a decision. Approving past an open critical or high exception also needs a written override."),
         ("Every Figure Sourced & Cited: ",
          "Extracted figures are linked directly to their source document, page number and quoted passage. Uncited facts are automatically rejected, allowing underwriters to verify "
          "numbers in seconds. Accepted means faithfully extracted, not verified true in the real world."),
         ("SBA SOP 50 10 Compliance Rules Engine: ",
          "Applies 11 SBA SOP 50 10 rules, each citing its section. Unresolved edge cases or discrepancies are surfaced directly to the human underwriter rather than silently skipped."),
         ("Prompt Injection & Document Shielding (\u201cDocuments Can\u2019t Talk Back\u201d): ",
          "Text within uploaded borrower documents is treated strictly as passive data, never as instructions to the model. Adversarial text or prompt-injection attempts designed to "
          "manipulate AI readers are flagged as critical exceptions and the facts from that document are held for a person."),
         ("Tamper-Evident Hash-Chained Audit Trail: ",
          "Every workflow state, extraction, rule evaluation and human action is recorded in an append-only, hash-chained ledger, giving examiners a record they can check for alteration.")])

H1("3. End-to-End Underwriting Workflow Stages")
P("Loan files move from initial intake to a prepared, reviewed and decided state through seven structured stages.")
table(["Stage", "Workflow Step", "Key System Operations & Safety Controls"], [
    ["1", "Intake", "Application intake with sensitive-identifier protection. The tax ID (EIN) is encrypted, and only the last four digits are exposed in the interface."],
    ["2", "Documents", "Malware scanning is required before any processing, and an upload is refused if the scanner cannot be reached. Name must match content; markup and active PDFs are refused. Documents are stored encrypted and scoped to the lender."],
    ["3", "Extraction + Citations", "Extraction of financial figures. Every fact is cited with source document, page and passage. Uncited facts are rejected."],
    ["4", "Rules Evaluation", "11 SBA SOP 50 10 compliance rules are evaluated automatically. Unknowns and exceptions are flagged for human review."],
    ["5", "Memo Drafting", "Draft credit memo generated with embedded source citations. Every figure is checked against its cited source, and the memo cannot contain approve or decline language."],
    ["6", "Human Decision", "The underwriter reviews, edits or adopts the memo and disposes each exception. Only underwriters can approve, decline or return files; approving past an open critical or high exception needs a written override, and a decided case is final."],
    ["7", "Servicing Handoff and Audit", "The final decision is recorded in the append-only ledger and queued, through a signed and retried outbox, to the servicing system. The servicing system is a mock adapter today."],
], [0.55, 1.55, 4.5])
H1("4. Security, Isolation & Auditability")
bullets([("Multi-Tenant Isolation: ",
          "Tenant separation is enforced at the database layer rather than purely in application code, so an application bug cannot read across lenders. Tests that attempt "
          "cross-lender reads confirm they are denied."),
         ("Tamper-Evident Audit Ledger: ",
          "Instead of basic event logging, Underwriting Copilot uses a hash-chained, append-only ledger. An examiner can run the chain check to see whether past decisions, rules or "
          "document versions were altered. Whether a given examiner accepts it as evidence is for the lender and the examiner to decide."),
         ("Standard Technology Stack: ",
          "Built on standard, well-supported infrastructure (TypeScript, Next.js, PostgreSQL) without exotic dependencies, which should make review by internal risk and IT teams "
          "straightforward. The one component that is not deterministic is the AI model, which sits behind a single gateway and whose answers are checked against the source text."),
         ("Sign-in and roles: ",
          "OpenID Connect through the lender's own identity provider, four roles (processor, underwriter, viewer, admin), and sessions that can be ended at once.")])

d.add_page_break()
H1("5. Workflow and architecture diagrams")
P("The workflow as a diagram. The audit record runs through every stage and is drawn as its own box (8). Stage 6 is the only place a decision is made.", after=4)
d.add_picture(str(here / "img" / "workflow.png"), width=Inches(5.0))
P("How the pieces fit together. A web application is what people use. A database holds the data and enforces the most important rules itself. A malware scanner checks uploads. "
  "Outside services read documents and receive approved files. Items marked as stand-in are not real yet.", after=4).paragraph_format.keep_with_next = True
d.add_picture(str(here / "img" / "architecture.png"), width=Inches(5.2))

H1("6. What we have measured, and the standards we map to")
table(["Item", "Result", "How to read it"], [
    ["Automated tests", "454 pass, including real-database tests", "Measured"],
    ["Browser walkthrough of the whole workflow", "40 of 40 steps pass with four roles and three files; also runs in the automated build on GitHub", "Measured, synthetic data"],
    ["Extraction on 120 synthetic packets (4,030 fields)", "87.8% accepted and correct; none falsely accepted; 8.4% not extracted (scans, no OCR)", "Measured with a stand-in model that reads printed labels"],
    ["Planted problems", "Caught in every packet of every class; two classes also over-flagged", "Measured"],
    ["OWASP ASVS 5.0.0, levels 1 and 2", "253 requirements: 108 met, 40 partial, 1 not met, 41 deferred, 62 not applicable, 1 not assessed", "Our own assessment, evidence cited"],
    ["NIST AI RMF", "72 subcategories: 9 addressed, 40 partial, 22 gaps, 1 not applicable", "Our own assessment"],
], [2.1, 3.0, 1.5])

H1("7. What this does not do yet")
bullets(["No real documents or lenders have been tested, so accuracy on real paperwork is unknown. A stand-in model is used, and scanned or image-only documents cannot be read yet.",
         "No time saving has been measured. A timed comparison with two underwriters is planned.",
         "Several checks are not built: eligibility, collateral, tax transcripts, personal financial statements, credit reports and global cash flow. Debt service uses only the new loan and a placeholder rate.",
         "Nothing is deployed, and no identity provider or hosting has been chosen.",
         "No outside penetration test, SOC 2 report or lender vendor review exists. Items for legal and compliance review are listed separately. Nothing in this document is legal advice."])

H1("8. Summary")
P("Underwriting Copilot is designed so that speed never costs control. It prepares the file, sources every figure and applies the SBA rules, while the decision, the "
  "override and the record all stay with people and are enforced by the database.")
box("Key takeaways.", "", [
    "Efficiency without a black box: every figure links to its page and passage.",
    "Mandatory human decision: software cannot approve, decline or rank, and the database refuses it.",
    "Proactive defenses: malware scanning, documents treated as data, and separated lender data.",
    "Provable auditability: an append-only, hash-chained record of every action.",
    "Honest limits: synthetic data only; real-world accuracy and time savings are still to be measured."])
last = d.paragraphs[-1]  # the spacer after the final box: make it tiny so it cannot spill onto an empty page
last.paragraph_format.space_after = Pt(0); last.paragraph_format.space_before = Pt(0); last.paragraph_format.line_spacing = Pt(1)
d.save(here / "Safe_AI_for_Commercial_Loan_Underwriting.docx")
print("ok")
