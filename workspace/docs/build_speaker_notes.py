"""Builds Fortech_Demo_Speaker_Notes.docx: what the presenter says, screen by screen, when demoing the Fortech
Underwriting Portal to a prospective lender. Written the way it is spoken (short sentences, plain words). It is for the
presenter, not the customer, so it also holds the rough edges to say up front and short answers for hard questions.
Screenshots come from the browser walkthrough (workspace/app/scripts/walkthrough.mjs) and live in img/speaker/.
Needs python-docx. Run from this folder: python3 build_speaker_notes.py
"""
import pathlib

from docstyle import DocBuilder, rgb, SLATE, TEAL

here = pathlib.Path(__file__).parent
SHOTS = here / "img" / "speaker"
SLATE_C, TEAL_C = rgb(SLATE), rgb(TEAL)

doc = DocBuilder(
    "Fortech Underwriting Portal",
    subtitle="Speaker notes for the customer demo: what to say, screen by screen",
    title_size=27, heading_size=16,
)
H, P, B = doc.H, doc.P, doc.B


def label(text):
    P(text, bold=True, color=TEAL_C, size=10.5)


def screen(title, image=None):
    H(title)
    if image and (SHOTS / image).exists():
        doc.picture(SHOTS / image, width_in=6.1)


def on_screen(text):
    label("On screen")
    P(text, italic=True, color=SLATE_C)


def say(*paragraphs):
    label("Say")
    for p in paragraphs:
        P(p)


def click(text):
    label("Click")
    P(text)


# ------------------------------------------------------------------ how to use this
H("How to use these notes")
P("This is for you, not for the customer. It follows the order of the demo. For each screen you get what is on it, "
  "what to say, and what to click. The wording is meant to be said out loud, so change it until it sounds like you.")
P("The whole demo takes about twenty minutes without questions. If you are short on time, skip the Files list, the audit "
  "trail and the roles, and keep the dashboard, one case, how the AI works, and security.")
P("If you only remember five things, remember these:", bold=True)
B(["The software prepares the file. A person decides.",
   "Every number on the screen has its source right next to it.",
   "The rules are ordinary tested code, not AI guesses.",
   "The data is separated by customer and encrypted, and we say plainly what we have not done yet.",
   "Everything you are showing is live, so say so when the numbers move."])

# ------------------------------------------------------------------ before you start
H("Before you start")
B([("Start the demo early.", " It needs the local test database running. Run workspace/app/scripts/demo-up.sh and wait for the line that says Demo ready. The first page can take a few seconds to build."),
   ("Begin signed out.", " You want them to see the login page first. If you are already signed in, sign out."),
   ("Use the whole screen.", " Open the site full screen at normal zoom. Check it on the projector before they arrive."),
   ("Everything is made-up data.", " Say it once at the start and again if anyone asks. No real borrower is in here."),
   ("Know the three rough edges.", " They are at the end of this document. Say them yourself, early, so nobody feels they caught you out.")])

# ------------------------------------------------------------------ opening
H("The opening")
say("Thanks for making the time. I'm going to show you how a loan file gets prepared in this portal, from the documents all the way to a decision. It's about twenty minutes.",
    "There are three things I'd like you to watch for. First, every number you see comes with its source. Second, the software does the preparation, but a person makes the decision. Third, it's all live, so you'll see things change as we go.",
    "Everything on screen is made-up data. There's no real borrower in here.")

# ------------------------------------------------------------------ screens
screen("Screen 1: The sign-in page", "sign-in.png")
on_screen("The Fortech page with three lines on the left: evidence on every line, policy checks you can read, a person always decides.")
say("This is the front door. People sign in with the company login they already use. We never see a password and we don't keep one.",
    "These three lines on the left are really the whole idea. Evidence on every line. Rules you can read. A person always decides. I'll show you each one in a minute.")
click("Continue to sign in. On the next page, pick Underwriter.")
say("That little page is a stand-in for your real login system. In your setup, this would be your own company sign-in.")

screen("Screen 2: The dashboard", "dashboard.png")
on_screen("Four numbers across the top, a ring showing where the files are, bars for open problems, and a list of files that need attention.")
say("This is what your team sees when they start the day. How many files are in the portal, how many are waiting for an underwriter, how many open problems are serious, and how much money is in play.",
    "The ring shows where the files are. The bars show what kind of problems are open. And this list at the bottom is where I'd start, because it puts the files that need attention first.",
    "Nobody built this report by hand. It's live. If a document finishes processing while we're talking, these numbers move on their own.")
click("Harbor Bakery, from the attention list.")

screen("Screen 3: One file", "case.png")
on_screen("The top of the Harbor Bakery file: the request, the owners, and the documents.")
say("Here's one file. A bakery asking for two hundred and fifty thousand dollars over ten years, for equipment. The request is at the top, and below it are the documents: tax returns, bank statements and a financial statement.",
    "Your processor uploads the documents right here. Then watch this list. Each document shows as waiting, then processing, then done, and nobody reloads the page. That's the software reading and checking them in the background.")
P("Optional live moment: upload one more statement from the sample files and let them watch it go from waiting to done.", italic=True, color=SLATE_C)

screen("Screen 4: The problems it found", "exceptions.png")
on_screen("Three open exceptions, one of them marked critical, each with a note box and a Dispose button.")
say("Now the part your underwriters will care about most. The software found three things it wants a person to look at.",
    "The red one says a document contains text that reads like instructions. Somebody put words in a document that sound like they're talking to an AI. We don't follow them. We flag it and ask a person.",
    "The other two are about the date on a financial statement, and a note about the coverage number, which I'll come back to. Nobody can close one of these without writing down why.")

screen("Screen 5: The policy checks", "rules.png")
on_screen("A table of rules, each with an outcome and the section of the SBA procedure it comes from.")
say("These are the policy checks. Every line is a rule from the SBA's own operating procedure, with the section it comes from. Each one says pass, needs review, or doesn't apply.",
    "These aren't AI guesses. They're ordinary code that we test. Same inputs, same answer, every time. And if a rule changes, we change its version, so you can always say which rules were in force on the day a file was decided.",
    "One honest note. The coverage check only counts the new loan, at a placeholder interest rate. Your real debt schedule is something we'd build with you.")

screen("Screen 6: Every number has its source", "facts.png")
on_screen("A table of facts. Each row has a value, a status, an evidence score and the exact words from the document.")
say("Every number the software read has its source on the same row: which document, which page, and the exact words. Your underwriter can check any of them in seconds.",
    "The ones marked accepted passed our checks. The words really are in the document, and the numbers add up. The ones marked proposed are waiting for a person to confirm or reject them.",
    "We don't let the AI's own confidence decide that. The evidence decides.")

screen("Screen 7: The memo draft", "memo.png")
on_screen("The credit memo draft, with a source in brackets after every sentence.")
say("This is the credit memo draft. Read any sentence and you'll see a note in brackets saying where it came from. A fact, a calculation, or a rule.",
    "Before the draft is even saved, the software checks every line against what it points to. If something doesn't match, the draft is thrown out and you see a problem instead.",
    "So your underwriter edits and adopts it. They aren't starting from a blank page.")

screen("Screen 8: The decision", "decision.png")
on_screen("The decision form with Approve, Decline and Request more information, a reasons box and an overrides box.")
say("Only an underwriter sees this form. Approve, decline, or ask for more information, with reasons written down.",
    "If there's a serious problem still open, you can't approve without writing down why you're overriding it. And once a file is decided, it's final. A mistake is fixed with a new entry, not by editing the old one. The database enforces that, so even a bug in our own software can't rewrite history.",
    "I'm not going to record one here, so the demo stays clean.")

screen("Screen 9: The record", "audit.png")
on_screen("The audit trail at the bottom of the file: who did what, and when, in order.")
say("At the bottom is the record. Who did what, and when. Each entry is linked to the one before it, so if anyone tried to change the past, it would show.")

screen("Screen 10: How the AI works", "how-the-ai-works.png")
on_screen("Eight steps, each tagged Person, AI, Code or System.")
say("Let me show you where the AI fits. There are eight steps, and the tags show who does each one. A person, the AI, plain code, or the system.",
    "The AI does two jobs. It reads the documents and proposes facts, and it drafts the memo. Everything around it is checked by code, and a person makes the decision.",
    "What it can't do is on this page too. It can't approve or decline. It can't change a rule. And it can't have a fact accepted without a source that actually exists.")

screen("Screen 11: Security and trust", "security-trust.png")
on_screen("Six protections, the four roles, and a yellow box at the bottom listing what is not done yet.")
say("I know you'll want to know how financial data is protected, so let me go through it.",
    "Your data is kept apart from every other customer by the database itself, not only by our application. Documents and taxpayer IDs are encrypted, and the screen only ever shows the last four digits. Sign-in goes through your login system, so there are no passwords stored with us.",
    "If a document tries to trick the AI, the AI doesn't have the power to do anything with it anyway. History can't be rewritten. And our logs don't contain taxpayer IDs or business names.",
    "Now the honest part, in the yellow box. We haven't had an outside penetration test yet. We don't have a SOC 2 report yet. And sign-in here runs against a stand-in. Those come before any real data goes in.")

screen("Screen 12: Why Fortech, and what is not built", "why-fortech.png")
on_screen("The six things the portal is built around, a table of design answers, and two lists: built and working, and not built yet.")
say("Today this covers SBA 7(a) file review and memo drafting. This list on the left is what's built and working. The list on the right is what isn't, and I'd rather you hear that from me now. Eligibility screening, credit reports, collateral, your existing debts and global cash flow, and the 504 and Express programs.",
    "I'm not going to claim a time saving either. To give you a real number we'd time it against how you work today, together.")

screen("Screen 13: The FAQ", "faq.png")
on_screen("Questions and answers in plain language, in four groups.")
say("We keep a plain-language FAQ here too. If anyone on your team has questions later, they can read the answers themselves.")

screen("Screen 14: Roles and signing out", "signed-out.png")
on_screen("Click Sign out, and the signed-out page appears.")
say("There are four roles. Viewers can look but not change anything. Processors prepare the file. Underwriters decide. Admins manage the people. I'll sign out so you can see the front door again.")

# ------------------------------------------------------------------ closing
H("The close: listen")
say("That's the walk-through. What I'd like to do now is listen. I'd like to hear how this fits, or doesn't, with how you work today.")
P("Ask, and write down the answers. Don't pitch while they are answering.", bold=True)
B(["Which loan programs and volumes would you start with?",
   "Walk me through how a file moves through your shop today. Who touches it, and where does it wait?",
   "What documents and systems do you rely on that we haven't shown you?",
   "What would you need to see before you'd trust this with a real file?",
   "Who has to say yes on your side? Security, compliance, legal?",
   "What would make a small pilot a clear yes for you?"])

# ------------------------------------------------------------------ pushback
H("If they push back")
P("Short answers, in plain words. Use your own.")
B([("Can the AI approve a loan?", " No. Only an underwriter can record a decision, and the database refuses anyone else."),
   ("What if the AI is wrong?", " Every fact has to point to words that really are in the document, the numbers are recalculated by code, and a person reviews the problems and decides."),
   ("Are you SOC 2 certified?", " Not yet. We have a threat model and a self-assessment against a public security standard, and I'll be clear that those are our own checks, not a certification."),
   ("Has it had a penetration test?", " Not yet. It comes before any real data."),
   ("Where does it run, and which AI sees our documents?", " Hosting isn't decided. In this demo the model is built in, so no document text leaves this machine. A real provider would be reviewed with you first."),
   ("How much time does it save?", " I won't give you a number I can't back up. We'd time it together on your own files."),
   ("How accurate is it on real documents?", " We haven't measured that yet. Our tests use made-up documents. We'd measure it on your own redacted files before anyone relies on it."),
   ("Is it compliant with lending rules?", " I can't say that and I'm not giving legal advice. We keep a list of items for legal and compliance review, and it's still open.")])

# ------------------------------------------------------------------ rough edges
H("The rough edges: say these first")
P("Say them yourself, early, in a calm voice. People trust you more when you point out the gaps before they do.")
B([("Made-up data.", " Every borrower, document and number is synthetic."),
   ("A stand-in AI model.", " The demo uses a built-in model that reads printed labels. It does not show how a real model does on real documents."),
   ("A stand-in login.", " Sign-in runs against a local test provider, not a real company login."),
   ("The coverage number.", " It counts only the new loan, at a placeholder interest rate, so it looks higher than it would on a real file."),
   ("What is not built.", " Eligibility screening, credit reports, collateral, existing debt and global cash flow, and the 504 and Express programs.")])

# ------------------------------------------------------------------ do not say
H("Things not to say")
B(["Don't give a time-saving number or an accuracy percentage. We haven't measured either on real documents.",
   "Don't say it is certified, compliant or approved by anyone. It isn't.",
   "Don't say the AI decides, scores or ranks anything. It doesn't, and that is the point.",
   "Don't compare us to other products by name. We haven't verified what they do or don't do.",
   "Don't promise a date for anything on the not-built list."])

P("All data shown in the demo is synthetic. Nothing here is legal or compliance advice.", italic=True, color=SLATE_C, size=9.5)

doc.save(here / "Fortech_Demo_Speaker_Notes.docx")
print("ok")
