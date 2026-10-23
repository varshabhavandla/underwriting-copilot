"""Builds Underwriting_Copilot_Pitch.docx: an external sales pitch to a prospective lender,
not an internal approval memo. Confident, benefit-led, no market-position hedging, no internal
"approve our budget" ask, no status/evidence metrics. Reuses the diagrams built by
build_overview.py (img/workflow.png, img/architecture.png) — run that first if they do not exist.
Needs python-docx. Run from this folder: python3 build_pitch.py
"""
import pathlib

from docstyle import DocBuilder, rgb, SLATE

here = pathlib.Path(__file__).parent

doc = DocBuilder(
    "Underwriting Copilot",
    subtitle="Loan files that are ready for a decision the moment they reach you",
    title_size=27, heading_size=16,
)
H, P, B = doc.H, doc.P, doc.B
SLATE = rgb(SLATE)

# Opening hook
H("The cost of preparation")
P("Every SBA 7(a) file that reaches an underwriter has already cost someone hours: reading tax returns and bank "
  "statements, keying figures into a spreadsheet, checking that they reconcile, matching them against the SBA's rules, "
  "and writing up a memo — all before the actual credit judgment begins. That work is where missed documents and "
  "mistyped figures slip through unnoticed, and it is where your underwriters' time goes instead of into the decisions "
  "that need their judgment.")
P("Underwriting Copilot does that preparation for you, and hands your underwriter a file that is already read, "
  "checked, and ready for a decision — with the proof for every figure attached.").runs[0].bold = True

# What it does
H("What you get")
B([("A file ready to review, not a stack to assemble.", " Application details, uploaded documents, extracted figures, flagged problems, and a drafted memo, all in one place."),
   ("Every figure, sourced.", " Each extracted number carries the exact document, page, and passage it came from — your underwriter checks the source in seconds instead of hunting for it."),
   ("The SBA's own rules, applied automatically.", " Eleven rules from SOP 50 10, each citing the section it enforces. Anything the rules cannot resolve is flagged for your underwriter, never silently skipped."),
   ("Problems surfaced, not buried.", " Missing documents, numbers that do not reconcile, stale statements, and anything unusual in the documents are flagged before your underwriter opens the file."),
   ("A memo your underwriter edits, not writes from scratch.", " Every line is cited and checked against the source before it reaches them."),
   ("A complete, provable record.", " Every step — who did what, when, under which policy version — is written to a log that cannot be altered after the fact.")])

# How it works
H("How it works")
doc.picture(here / "img" / "workflow.png", width_in=6.3)
P("From intake to a decision-ready file. Your underwriter is the only one who can turn it into an approval, decline, or "
  "return — the system is built so it cannot do that itself.", italic=True, color=SLATE)
doc.page_break()
doc.picture(here / "img" / "architecture.png", width_in=6.7)
P("A standard, well-supported stack — no exotic dependencies, no black box.", italic=True, color=SLATE)

# Why different
H("Why Underwriting Copilot is different")
P("Most AI tools in this space hand you an answer and ask you to trust it. We built the opposite: every output is "
  "checkable, and the parts that matter most are enforced where you can't accidentally turn them off.")
B([("Nothing is a black box.", " Every figure a underwriter sees is traceable to a page and a quoted passage — not a model's unverified summary."),
   ("The human-decision rule lives in the database, not the app.", " Even a bug, a bad integration, or a misconfigured workflow cannot let the software approve, decline, or rank a borrower. The data layer itself refuses."),
   ("The audit trail is provable, not just logged.", " Decisions and events are written in a hash-chained, append-only ledger — we can demonstrate that no past record has been altered, not just assert it."),
   ("Documents can't talk back.", " Text inside an uploaded document is always data to extract from, never an instruction to follow. Content designed to manipulate an AI reader is caught and flagged, not obeyed — a risk most AI document tools do not defend against at all."),
   ("Each lender's data is structurally separate.", " Enforced by the database itself, not by application code that could have a bug.")])

# How we'd work together
H("How we would prove this to you")
B([("A working demonstration.", " We walk your team through a real file, start to finish, on your own time."),
   ("A side-by-side evaluation on your own historical files.", " Redacted and consented, so you see real results on real documents before anything is relied on."),
   ("A right-sized pilot.", " Your underwriters run both the current process and the assisted one, so the comparison is theirs to judge — not a claim we ask you to take on faith."),
   ("Security and compliance on your terms.", " We bring a third-party security review and are ready to work through your vendor-risk and fair-lending review process before any real file is touched.")])

# CTA
H("Let's talk")
P("We would like fifteen minutes to walk your team through the system and hear what a pilot would need to look like for "
  "you. No commitment, no cost to see it — just a conversation about whether this is worth your underwriters' time to "
  "evaluate properly.").runs[0].bold = True
P("All data shown in a demonstration is synthetic; nothing here is legal or compliance advice.", italic=True, color=SLATE, size=9.5)

doc.save(here / "Underwriting_Copilot_Pitch.docx")
print("ok")
