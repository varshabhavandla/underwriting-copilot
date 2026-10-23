"""Builds Underwriting_Copilot_Project_Overview.docx (and the two diagrams in img/). Run from this folder: python3 build_overview.py
Needs python-docx and matplotlib. The workflow diagram follows the eight-stage mind map the builder shared; the collapsed branches
(Rules, Handoff, Audit) are filled in from this project's own design, not from the mind map."""
import pathlib
import matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt
from matplotlib.patches import FancyBboxPatch, FancyArrowPatch
from docx import Document
from docx.shared import Pt, RGBColor, Inches

here = pathlib.Path(__file__).parent
(here / "img").mkdir(exist_ok=True)
NAVY, TEAL, SLATE, LIGHT, INK = "#0F2540", "#1B998B", "#3D6FB6", "#EEF2F6", "#17212B"


def box(ax, x, y, w, h, fc, ec=None, r=0.08):
    ax.add_patch(FancyBboxPatch((x, y), w, h, boxstyle=f"round,pad=0,rounding_size={r}", fc=fc, ec=ec or fc, lw=1))


def workflow():
    stages = [
        ("1", "Intake", ["Processor fills the application", "Business details stored", "Tax ID encrypted; last 4 digits shown"]),
        ("2", "Documents", ["Processor uploads statements, financials, returns", "Name must match content", "Markup and active PDFs refused", "Malware scan must pass; refused if scanner is down"]),
        ("3", "Extraction + citations", ["Facts pulled: revenue, balances", "Every accepted fact keeps its source passage", "Last run: all 102 facts cited"]),
        ("4", "Rules", ["11 SBA SOP 50 10 rules run", "Unknown or failing goes to a person", "Missing and conflicting items become exceptions"]),
        ("5", "Memo draft", ["Credit memo drafted", "Checked against facts so it cannot claim more than the file supports"]),
        ("6", "Human decision", ["Underwriter reads the file, adopts or edits the memo", "Disposes each exception with a note", "Only an underwriter can record a decision", "Approving past an open critical or high exception needs a written override", "A decided case cannot be decided again"]),
        ("7", "Handoff", ["Approved file queued in an outbox", "Sent to the servicing system (a mock one for now)"]),
        ("8", "Audit", ["Every step logged", "Append-only, hash-chained", "The database can prove nothing was altered"]),
    ]
    fig, ax = plt.subplots(figsize=(11.5, 10.2), dpi=170)
    ax.set_xlim(0, 11.5); ax.set_ylim(0, 10.2); ax.axis("off")
    cw, ch, gx = 2.55, 4.4, 0.27
    for i, (num, title, pts) in enumerate(stages):
        col, row = i % 4, i // 4
        x = 0.25 + col * (cw + gx)
        y = 4.5 - row * (ch + 0.35) + (0.15 if row == 0 else 0)
        y = 5.35 if row == 0 else 0.45
        human = num == "6"
        box(ax, x, y, cw, ch, NAVY if human else LIGHT)
        ax.add_patch(plt.Circle((x + 0.35, y + ch - 0.4), 0.22, fc=TEAL, ec=TEAL))
        ax.text(x + 0.35, y + ch - 0.4, num, ha="center", va="center", color="white", fontsize=11, fontweight="bold")
        ax.text(x + 0.7, y + ch - 0.4, title, ha="left", va="center", color="white" if human else NAVY, fontsize=11, fontweight="bold")
        yy = y + ch - 0.95
        for p in pts:
            import textwrap
            lines = textwrap.wrap(p, 26)
            ax.text(x + 0.2, yy, "• " + lines[0], ha="left", va="top", color="white" if human else INK, fontsize=8.6)
            for ln in lines[1:]:
                yy -= 0.2
                ax.text(x + 0.2 + 0.11, yy, ln, ha="left", va="top", color="white" if human else INK, fontsize=8.6)
            yy -= 0.38
        if col < 3:
            ax.add_patch(FancyArrowPatch((x + cw + 0.02, y + ch / 2), (x + cw + gx - 0.02, y + ch / 2), arrowstyle="-|>", mutation_scale=12, color=SLATE, lw=1.4))
    ax.add_patch(FancyArrowPatch((0.25 + 3 * (cw + gx) + cw / 2, 5.33), (0.25 + cw / 2, 4.87), connectionstyle="arc3,rad=0", arrowstyle="-|>", mutation_scale=12, color=SLATE, lw=1.4))
    ax.text(5.75, 10.1, "Lending Copilot workflow: the tool prepares the file, the underwriter decides", ha="center", va="top", fontsize=12, fontweight="bold", color=NAVY)
    fig.savefig(here / "img" / "workflow.png", bbox_inches="tight", facecolor="white")
    plt.close(fig)


def architecture():
    fig, ax = plt.subplots(figsize=(11, 5.6), dpi=170)
    ax.set_xlim(0, 11); ax.set_ylim(0, 5.6); ax.axis("off")
    ax.text(5.5, 5.5, "How the pieces fit together", ha="center", va="top", fontsize=12, fontweight="bold", color=NAVY)

    def block(x, y, w, h, title, sub, fc=LIGHT, tc=NAVY, sc=INK):
        box(ax, x, y, w, h, fc)
        ax.text(x + w / 2, y + h - 0.2, title, ha="center", va="top", fontsize=10.5, fontweight="bold", color=tc)
        import textwrap
        yy = y + h - 0.55
        for line in sub:
            for ln in textwrap.wrap(line, int(w * 11.5)):
                ax.text(x + w / 2, yy, ln, ha="center", va="top", fontsize=8.6, color=sc); yy -= 0.2
            yy -= 0.05

    def arrow(a, b):
        ax.add_patch(FancyArrowPatch(a, b, arrowstyle="-|>", mutation_scale=12, color=SLATE, lw=1.4))

    block(0.25, 3.45, 2.6, 1.6, "People", ["Processor, underwriter, viewer, admin", "Use the web screens in a browser"])
    block(3.4, 3.45, 4.2, 1.6, "The application (Next.js, TypeScript)", ["Screens and the server behind them", "Sign-in, roles, upload checks, rules, memo drafting, decision gate"], fc=NAVY, tc="white", sc="white")
    block(8.15, 3.45, 2.6, 1.6, "Sign-in provider", ["OpenID Connect", "Local stand-in for now"])
    block(0.25, 0.4, 2.6, 2.3, "Malware scanner", ["Checks every upload", "Refuses uploads if it cannot be reached", "Local stand-in for now"])
    block(3.4, 0.4, 4.2, 2.3, "Database (PostgreSQL)", ["Each lender's rows are kept separate by the database", "Decisions, memos and the audit log can only be added to", "Documents and tax IDs encrypted", "The database refuses a decision from anyone but an underwriter"], fc=TEAL, tc="white", sc="white")
    block(8.15, 0.4, 2.6, 2.3, "Outside services", ["Model gateway: reads documents (stand-in model now)", "Servicing adapter: receives approved files (mock now)"])
    arrow((2.85, 4.25), (3.4, 4.25)); arrow((3.4, 4.5), (2.85, 4.5))
    arrow((7.6, 4.25), (8.15, 4.25))
    arrow((5.5, 3.45), (5.5, 2.7))
    arrow((3.4, 3.7), (2.2, 2.7))
    arrow((6.7, 3.45), (9.0, 2.7))
    fig.savefig(here / "img" / "architecture.png", bbox_inches="tight", facecolor="white")
    plt.close(fig)


workflow()
architecture()

d = Document()
for s in d.sections:
    s.left_margin = s.right_margin = Inches(0.9); s.top_margin = s.bottom_margin = Inches(0.8)
st = d.styles["Normal"]; st.font.name = "Calibri"; st.font.size = Pt(11.5)
for n, sz in (("Heading 1", 15), ("Title", 26)):
    h = d.styles[n]; h.font.name = "Calibri"; h.font.size = Pt(sz); h.font.bold = True; h.font.color.rgb = RGBColor(0x0F, 0x25, 0x40)


def H(t): d.add_heading(t, level=1)


def P(t):
    p = d.add_paragraph(t); p.paragraph_format.space_after = Pt(6); return p


def B(items):
    for t in items:
        p = d.add_paragraph(style="List Bullet"); p.paragraph_format.space_after = Pt(3)
        if isinstance(t, tuple):
            r = p.add_run(t[0]); r.bold = True; p.add_run(t[1])
        else:
            p.add_run(t)


d.add_paragraph("Underwriting Copilot", style="Title")
P("Project overview").runs[0].font.size = Pt(14)

H("What it is")
P("Underwriting Copilot is software that helps a lender prepare a small-business loan file. We are starting with SBA 7(a) loans. "
  "It reads the application and the supporting documents, checks them against the SBA rules, flags anything that looks wrong, and drafts a credit memo. "
  "An underwriter then reviews the prepared file and makes the decision.")
P("The software never approves or declines a loan. A person always decides.").runs[0].bold = True

H("Why we are building it")
P("Before an underwriter can judge a loan, someone has to read the documents, copy the numbers into a spreadsheet, check that they add up, "
  "compare them with the program rules, and write the memo. That preparation takes a large share of the time and mistakes creep in. "
  "We believe a prepared file, with every number linked to the page it came from, lets underwriters spend their time on the decision. "
  "We have not yet proven the time savings on real files. Measuring them is the next major step.")

H("How it works")
B([("1. Application. ", "A processor enters the borrower and the loan request. The tax ID is stored encrypted."),
   ("2. Documents. ", "The processor uploads tax returns, bank statements and financial statements. Each file is checked for safety before it is kept."),
   ("3. Reading. ", "The software pulls out the key figures. Every figure keeps a link to the page and passage it came from."),
   ("4. Checks. ", "Eleven SBA rules run, and the software flags missing documents, numbers that do not add up, and anything suspicious."),
   ("5. Memo. ", "A credit memo is drafted. Every line is cited, and its numbers are checked against the source."),
   ("6. Decision. ", "The underwriter reviews the file and approves, declines or sends it back. Approving past an open serious problem needs a written reason."),
   ("7. Handoff and record. ", "An approved file goes to the lender's servicing system (a mock one for now). Every step is saved in a log that cannot be changed afterwards.")])

d.add_page_break()
H("Workflow diagram")
P("The same eight stages, with what happens inside each. Stage 6 is highlighted because it is the only place a decision is made.")
d.add_picture(str(here / "img" / "workflow.png"), width=Inches(6.2))
P("Stages 1, 2, 3, 5 and 6 follow the workflow map the team built in NotebookLM. Rules, Handoff and Audit were collapsed in the screenshot of that map, so their details come from the project's own design.").runs[0].italic = True

d.add_page_break()
H("Architecture: how the pieces fit")
P("Four things matter for understanding the system. A web application is what people use. A database holds the data and enforces the most important rules itself, so a bug in the application cannot break them. "
  "A malware scanner checks every upload. Outside services read documents and receive approved files. Items marked “stand-in” are not real yet.")
d.add_picture(str(here / "img" / "architecture.png"), width=Inches(6.7))

H("Who uses it")
B([("Processor: ", "enters applications, uploads documents, builds the file."),
   ("Underwriter: ", "reviews the file and makes the decision. Only this role can decide."),
   ("Viewer: ", "can read files but not change anything."),
   ("Admin: ", "manages users, roles and sign-in settings.")])

H("Why it can be trusted")
B([("A human decides. ", "This is enforced by the database, not only by the screens."),
   ("Everything is traceable. ", "No number appears without the page it came from."),
   ("Each lender's data is kept separate. ", "One lender cannot see another's files."),
   ("Documents cannot give orders. ", "Text inside a document is treated as data. If a document tries to instruct the software, it is flagged and a person is told.")])

H("Where we are today")
P("Working and tested, using made-up (synthetic) data on a local computer:")
B(["The full path from application to decision, with the checks above.",
   "Sign-in, four user roles and admin screens.",
   "454 automated tests and a 40-step run through the real screens, all passing.",
   "On 120 synthetic test packets the software accepted 87.8% of figures correctly and wrongly accepted none."])
P("Not done yet:")
B(["No real documents or lenders have been tested, so real-world accuracy is unknown.",
   "A stand-in model is used instead of a real AI provider, and scanned documents cannot be read yet (no OCR).",
   "Nothing is deployed, and the hosting choice is still open.",
   "No outside security test or legal review has happened. Nothing here is legal advice.",
   "Several SBA checks are not built yet, such as eligibility, collateral and credit reports."])

H("What happens next")
B([("Days 1 to 30: ", "talk to lenders, time how long the work takes by hand with two underwriters, choose the sign-in provider and the hosting."),
   ("Days 31 to 60: ", "connect a real AI provider and scanning, and publish the real accuracy results, including failures."),
   ("Days 61 to 90: ", "run a pilot on redacted, consented files with a lender's own policy, plus a security test and legal review.")])

H("What we need from the team")
B(["Which loan types and volumes to focus on first, and what result counts as success.",
   "Introductions to lenders, and two underwriters for the timing study.",
   "A decision on hosting and on which AI provider to evaluate."])

P("All data in this project is synthetic. No real borrower data is used.").runs[0].italic = True
d.save(here / "Underwriting_Copilot_Project_Overview.docx")
print("ok")
