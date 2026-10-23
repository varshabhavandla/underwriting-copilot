"""Shared python-docx style and build helpers for the narrative documents in this folder
(Underwriting_Copilot_Project_Overview, _Pitch, and future ones). Keeps every document in the
same visual style and avoids re-deriving the docx setup / pdf conversion / heading-check steps
in each build script. See .claude/skills/docgen/SKILL.md for the full workflow.
"""
import pathlib
import subprocess

from docx import Document
from docx.shared import Pt, RGBColor, Inches

NAVY, TEAL, SLATE, LIGHT, INK = "#0F2540", "#1B998B", "#3D6FB6", "#EEF2F6", "#17212B"


def rgb(hex_color):
    """Hex string (e.g. NAVY) -> docx RGBColor, for runs that need a color object instead of CSS."""
    h = hex_color.lstrip("#")
    return RGBColor(int(h[0:2], 16), int(h[2:4], 16), int(h[4:6], 16))


class DocBuilder:
    """A python-docx Document pre-styled to this project's house look (Calibri, navy headings,
    0.9in/0.8in margins). Construct with the cover title, then build top-to-bottom with
    H/P/B/picture/page_break, and finish with save()."""

    def __init__(self, title, subtitle=None, title_size=26, heading_size=15):
        self.doc = d = Document()
        for s in d.sections:
            s.left_margin = s.right_margin = Inches(0.9)
            s.top_margin = s.bottom_margin = Inches(0.8)
        normal = d.styles["Normal"]
        normal.font.name = "Calibri"
        normal.font.size = Pt(11.5)
        for name, size in (("Heading 1", heading_size), ("Title", title_size)):
            style = d.styles[name]
            style.font.name = "Calibri"
            style.font.size = Pt(size)
            style.font.bold = True
            style.font.color.rgb = rgb(NAVY)
        d.add_paragraph(title, style="Title")
        if subtitle:
            self.P(subtitle, size=14, color=rgb(SLATE))

    def H(self, text):
        self.doc.add_heading(text, level=1)

    def P(self, text, italic=False, bold=False, color=None, size=None):
        p = self.doc.add_paragraph()
        r = p.add_run(text)
        r.italic = italic
        r.bold = bold
        if color:
            r.font.color.rgb = color
        if size:
            r.font.size = Pt(size)
        p.paragraph_format.space_after = Pt(6)
        return p

    def B(self, items):
        """items: strings, or (bold_lead, rest) tuples for a bolded lead-in."""
        for t in items:
            p = self.doc.add_paragraph(style="List Bullet")
            p.paragraph_format.space_after = Pt(3)
            if isinstance(t, tuple):
                r = p.add_run(t[0])
                r.bold = True
                p.add_run(t[1])
            else:
                p.add_run(t)

    def picture(self, path, width_in=6.2):
        self.doc.add_picture(str(path), width=Inches(width_in))

    def page_break(self):
        self.doc.add_page_break()

    def save(self, path):
        self.doc.save(str(path))
        return pathlib.Path(path)


def headings(docx_path):
    """Title/Heading-1 text of a saved docx, in order. Use after a build to confirm an edit
    landed (e.g. a section was removed) without opening the file."""
    d = Document(str(docx_path))
    return [p.text for p in d.paragraphs if p.style.name in ("Title", "Heading 1") and p.text.strip()]


def convert_to_pdf(docx_path):
    """Run LibreOffice headless to produce the matching PDF next to docx_path. Returns the PDF path.
    Needs `soffice` on PATH (LibreOffice)."""
    docx_path = pathlib.Path(docx_path)
    subprocess.run(
        ["soffice", "--headless", "--convert-to", "pdf", docx_path.name],
        cwd=docx_path.parent, check=True, capture_output=True,
    )
    return docx_path.with_suffix(".pdf")
