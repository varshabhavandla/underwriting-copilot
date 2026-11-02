import Link from "next/link";
import { requireSession } from "@/server/guard";
import { PageHeader } from "../ui";

export const dynamic = "force-dynamic";
export const metadata = { title: "FAQ | Fortech Underwriting Portal" };

interface Qa { q: string; a: string[] }
interface Group { title: string; items: Qa[] }

const GROUPS: Group[] = [
  {
    title: "How it works",
    items: [
      { q: "Can the AI approve or decline a loan?", a: ["No. Only an authorized underwriter can record a decision, and the database refuses a decision from anyone else. The status of a file stays at needs review until a person acts."] },
      { q: "What does the AI actually do?", a: ["It reads document text and proposes facts, each with the page and passage it came from. It also drafts the credit memo from verified facts, calculations and rule results. It has no tools and no authority to change anything."] },
      { q: "What if the AI gets a number wrong?", a: ["A fact is accepted only if its cited passage really appears in the source text, and totals and ratios are recomputed by code. Anything that cannot be verified stays a proposal for an underwriter to confirm or reject. Memo lines are checked against what they cite, and a draft that fails the check is rejected."] },
      { q: "Does the AI's own confidence decide what is accepted?", a: ["No. A confidence score stated by a model never decides whether a fact is accepted. Verification against the source does."] },
      { q: "Which policy rules does it check?", a: ["Tested rules mapped to SBA SOP 50 10: loan amount limit, guaranty percentage, maturity, ownership total, required documents, financial statement freshness, debt service coverage and more. Every result shows its SOP section, and a rule change bumps a version.", "Debt service coverage today counts only the new loan, at a placeholder 9% rate."] },
      { q: "Which documents can it read?", a: ["Tax returns, bank statements and financial statements, as PDF, PNG, JPEG or plain text files up to 4 MB each. Files that cannot be read automatically are routed to manual reading."] },
      { q: "Does it connect to our loan origination system?", a: ["It works from uploaded documents. After a human decision it can emit a signed, retried handoff event through an adapter interface. The adapter in this demo is a mock, and a connection to a specific system is not built yet."] },
      { q: "Does it score or rank borrowers?", a: ["No. The design forbids producing credit scores or rankings, and tests enforce it. The AI extracts and drafts, rules are tested code, and a person decides."] },
    ],
  },
  {
    title: "Security and financial data",
    items: [
      { q: "How is our data kept separate from other customers?", a: ["The database enforces row-level security on every table, and the application cannot bypass it. A request for another customer's file gets the same answer as a file that does not exist. Tests prove the denial and pair it with a control that succeeds."] },
      { q: "Is our data encrypted?", a: ["Stored documents and sensitive identifiers are encrypted with AES-256-GCM using a separate key for each customer. A taxpayer ID is stored encrypted, and only its last four digits are shown. In transit, TLS is provided by the hosting platform, and a production database connection must use TLS."] },
      { q: "How do people sign in?", a: ["Through your own identity provider using OpenID Connect with PKCE. Fortech stores no passwords. Sessions are revocable, and a role change applies on the very next request."] },
      { q: "What stops a malicious document from manipulating the AI?", a: ["Document text is treated as data, never as instructions. The step that reads it has no tools, its output must fit a fixed structure, every value must cite a real passage, and instruction-like text raises a critical exception for a person to review."] },
      { q: "Can history be changed after a decision?", a: ["No. Decisions, rule runs, memos and audit events are append-only, and audit events are hash-chained so tampering shows. A decided file is final, and a correction is a new entry."] },
      { q: "What is written to the logs?", a: ["Logs hold no taxpayer IDs, business names or tokens. The end-to-end tests check the server log after a full run."] },
      { q: "Which AI model provider sees our documents?", a: ["In this demo the model is built in, so document text is not sent to an outside service. A real model provider is an opt-in integration. Every call would go through a single gateway that redacts, applies budgets and records the prompt version, model and hashes, and the provider's retention, training, region and security terms would be reviewed with you first."] },
      { q: "Where is it hosted?", a: ["Hosting for a pilot has not been decided. Nothing real is processed until hosting and the model provider have been reviewed with you."] },
      { q: "Are you SOC 2 certified, or has it had a penetration test?", a: ["Not yet on either. We keep a STRIDE threat model whose controls are covered by automated tests, and a self-assessment against OWASP ASVS 5.0 Level 2. These are self-assessments, not certifications."] },
    ],
  },
  {
    title: "Scope and status",
    items: [
      { q: "What is not built yet?", a: ["Eligibility screening, IRS tax transcripts, personal financial statements, credit reports, collateral and appraisals, existing business debt and global cash flow, franchise and insurance items, the interest rate cap check, and SBA 504 and SBA Express. The Why Fortech page lists them."] },
      { q: "How much time does it save?", a: ["We do not claim a figure. Any number needs a timed comparison against your current process, and we would measure it with you."] },
      { q: "How accurate is it on real documents?", a: ["Not measured yet. Our tests use synthetic documents. Accuracy would be measured on your own redacted historical files before anyone relies on it."] },
      { q: "Is it compliant with lending regulations?", a: ["We do not claim compliance or give legal advice. A list of items for legal and compliance review is kept, and it is still open."] },
    ],
  },
  {
    title: "Using the portal",
    items: [
      { q: "Who can do what?", a: ["Viewers read. Processors also submit applications, upload documents and build the file. Underwriters also dispose exceptions, adopt the memo and record the decision, and they are the only role that decides. Admins manage users, single sign-on and the security events screen."] },
      { q: "How do I add a new file?", a: ["Use New application in the sidebar, then upload the documents on the case page and build the file. Progress shows live while the documents are processed."] },
      { q: "Does the dashboard update by itself?", a: ["Yes. The dashboard, the files list and each case page refresh as documents finish processing, so there is no need to reload."] },
    ],
  },
];

export default async function Faq() {
  await requireSession("view", "/faq");
  return (
    <main className="faq">
      <PageHeader eyebrow="Platform" title="Frequently asked questions" subtitle="Plain answers about how Fortech works, how it protects financial data, and what it does not do yet." />
      {GROUPS.map((g) => (
        <div key={g.title} className="faq-group">
          <h2 className="section-title">{g.title}</h2>
          {g.items.map((i) => (
            <details key={i.q}>
              <summary>{i.q}</summary>
              <div className="answer">{i.a.map((p) => <p key={p}>{p}</p>)}</div>
            </details>
          ))}
        </div>
      ))}
      <p className="section-sub" style={{ marginTop: 26 }}>
        More detail: <Link href="/why-fortech">Why Fortech</Link>, <Link href="/how-the-ai-works">How the AI works</Link> and <Link href="/security-trust">Security &amp; trust</Link>.
      </p>
    </main>
  );
}
