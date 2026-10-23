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
    for k, row in enumerate(t.rows):
        trPr = row._tr.get_or_add_trPr(); trPr.append(OxmlElement("w:cantSplit"))
        if k == 0: trPr.append(OxmlElement("w:tblHeader"))
        for i, w in enumerate(widths): row.cells[i].width = Inches(w)
    sp = d.add_paragraph(); sp.paragraph_format.space_after = Pt(2)


d.add_paragraph("Safe AI for Commercial Loan Underwriting", style="Title")
box("Executive summary:",
    "Underwriting Copilot prepares commercial loan files for a human underwriter, starting with SBA 7(a) loans. It reads the application and the supporting "
    "documents, ties every figure to the page it came from, runs eleven rules taken from SBA SOP 50 10, flags what is missing or wrong, and drafts a cited "
    "credit memo. The underwriter then reviews the file and makes the decision. The software cannot approve, decline or rank a borrower, and the database enforces this.")

H1("1. The operational challenge")
P("Before an underwriter can judge whether a business is a sound credit, someone must read the tax returns, bank statements and financial statements, key the figures "
  "into a spreadsheet, check that the totals reconcile, compare the file against program rules such as SBA SOP 50 10, and draft the memo. This preparation is where "
  "time goes, and where tired eyes mistype a number or miss a document.")
P("Underwriting Copilot targets that preparation. It is built as a careful assistant, not a black box: it shows its sources, lists what it did not check, and leaves "
  "the judgment to the underwriter. The aim is to give underwriters back time for the credit decision. That benefit is our hypothesis and has not been measured on real files.")

H1("2. Five safeguards, explained")
bullets([("A person decides, and the database enforces it. ",
          "The database refuses to record a decision unless it comes from someone acting as an underwriter, and refuses to approve past an open critical or high exception "
          "without a written override. A bug in a screen or an integration cannot approve a loan. The software never ranks or scores borrowers."),
         ("Every figure is sourced. ",
          "Each figure appears beside the document, page and quoted passage it came from, so a number can be checked in seconds. A fact without a citation is rejected. "
          "Accepted means faithfully extracted from the document, not true in the real world, and the screen says so."),
         ("Rules are code, and unknowns are surfaced. ",
          "Eleven rules each cite their SOP 50 10 section. A rule that cannot be evaluated returns needs-review and never passes silently. Every run lists what was not evaluated."),
         ("Documents cannot give orders. ",
          "Text inside a document is treated as data to read, never as instructions. Text that looks like an instruction raises a critical exception, and the facts from that "
          "document are held for a person. No document-reading step can decide or write a decision."),
         ("A tamper-evident record, and separated lenders. ",
          "Every state change, extraction, rule result and human action goes into an append-only log in which each entry depends on the one before, and the database can check the "
          "chain on demand. Each lender's rows are kept apart by the database itself, so application bugs cannot read across lenders.")])

H1("3. The workflow, stage by stage")
P("Every file passes through the same eight stages. The only stage where a decision is made is stage 6.")
d.add_picture(str(here / "img" / "workflow.png"), width=Inches(5.9))
table(["Stage", "What happens", "Safety control"], [
    ["1  Intake", "A processor enters the borrower and the loan request.", "The tax ID (EIN) is encrypted. Only the last four digits are ever shown."],
    ["2  Documents", "Tax returns, bank statements and financial statements are uploaded.", "Name must match content; markup and active PDFs are refused; a malware scan must pass, and the upload is refused if the scanner cannot be reached."],
    ["3  Extraction with citations", "Figures such as revenue and balances are read from the documents.", "Every accepted fact keeps its document, page and quoted passage. A fact without a citation is rejected."],
    ["4  Rules", "Eleven SBA SOP 50 10 rules run on the accepted facts. Seven always apply; four apply conditionally.", "A rule that cannot be evaluated returns needs-review. It never passes silently."],
    ["5  Memo draft", "A credit memo is drafted from accepted facts.", "Every line is cited and its numbers are checked against the cited source. The memo cannot contain approve or decline language."],
    ["6  Human decision", "The underwriter reviews, adopts or edits the memo, disposes each exception with a note, and approves, declines or returns the file.", "Only an underwriter can record a decision. Approving past an open critical or high exception needs a written override. A decided case is final."],
    ["7  Handoff", "An approved file is queued for the servicing system.", "Delivery goes through a signed, retried outbox. The servicing system is a mock for now."],
    ["8  Audit", "Every step is recorded.", "An append-only, hash-chained log that the database can verify."],
], [1.45, 2.45, 2.7])

H1("4. Architecture")
P("A web application is what people use. A database holds the data and enforces the most important rules itself. A malware scanner checks uploads. Outside services read "
  "documents and receive approved files. Items marked as stand-in are not real yet.")
d.add_picture(str(here / "img" / "architecture.png"), width=Inches(5.9))
bullets([("Technology: ", "TypeScript, Next.js and React for screens and server; PostgreSQL 16 for data. Standard, widely supported components."),
         ("Sign-in: ", "OpenID Connect through the lender's own identity provider, four roles (processor, underwriter, viewer, admin), and sessions that can be ended at once."),
         ("Model access: ", "all model calls go through one gateway that redacts identifiers first and checks every answer against the source text. Model-stated confidence never decides whether a fact is accepted.")])

H1("5. What we have measured, and the standards we map to")
table(["Item", "Result", "How to read it"], [
    ["Automated tests", "454 pass, including real-database tests", "Measured"],
    ["Browser walkthrough of the whole workflow", "40 of 40 steps pass with four roles and three files; also runs in the automated build on GitHub", "Measured, synthetic data"],
    ["Extraction on 120 synthetic packets (4,030 fields)", "87.8% accepted and correct; none falsely accepted; 8.4% not extracted (scans, no OCR)", "Measured with a stand-in model that reads printed labels"],
    ["Planted problems", "Caught in every packet of every class; two classes also over-flagged", "Measured"],
    ["OWASP ASVS 5.0.0, levels 1 and 2", "253 requirements: 108 met, 40 partial, 1 not met, 41 deferred, 62 not applicable, 1 not assessed", "Our own assessment, evidence cited"],
    ["NIST AI RMF", "72 subcategories: 9 addressed, 40 partial, 22 gaps, 1 not applicable", "Our own assessment"],
], [2.1, 3.0, 1.5])

H1("6. What this does not do yet")
bullets(["No real documents or lenders have been tested, so accuracy on real paperwork is unknown. A stand-in model is used, and scanned or image-only documents cannot be read yet.",
         "No time saving has been measured. A timed comparison with two underwriters is planned.",
         "Several checks are not built: eligibility, collateral, tax transcripts, personal financial statements, credit reports and global cash flow. Debt service uses only the new loan and a placeholder rate.",
         "Nothing is deployed, and no identity provider or hosting has been chosen.",
         "No outside penetration test, SOC 2 report or lender vendor review exists. Items for legal and compliance review are listed separately. Nothing in this document is legal advice.",
         "The audit log makes tampering detectable. Whether an examiner accepts it as evidence is for the lender and its examiner to decide."])

H1("7. Summary")
P("Underwriting Copilot is designed so that speed never costs control. It prepares the file, sources every figure and applies the SBA rules, while the decision, the override and the "
  "record all stay with people and are enforced by the database.")
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
