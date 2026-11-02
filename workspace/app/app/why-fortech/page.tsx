import Link from "next/link";
import { requireSession } from "@/server/guard";
import { Icon } from "../icons";
import { Callout, Feature } from "../ui";

export const dynamic = "force-dynamic";
export const metadata = { title: "Why Fortech | Fortech Underwriting Portal" };

const DESIGN: [string, string][] = [
  ["Who makes the credit decision?", "An authorized underwriter, always. The portal never approves or declines, and its status stays at needs review until a person acts."],
  ["Where do the numbers come from?", "Totals and ratios are recomputed by tested code from cited source passages. A model does not get to state a figure on its own."],
  ["What can the AI touch?", "It reads documents and proposes facts. It has no tools and no authority: it cannot record a decision, change a rule or edit a record."],
  ["How are policy checks applied?", "As versioned, tested rules mapped to SBA SOP 50 10 sections. They fail closed, and changing a rule bumps its version."],
  ["What if a document contains hostile text?", "Document text is treated as data, never as instructions. Instruction-like text raises a critical exception for a person to review."],
  ["What is recorded about a decision?", "Who decided, the policy version, the reasons and any overrides. Decisions are append-only: a correction is a new entry, never an edit."],
];

const TODAY = [
  "Intake of the application and its documents, with background processing and live progress",
  "Extraction of facts, each with its source document, page and passage",
  "Rule checks mapped to SOP sections: loan amount, guaranty, maturity, ownership, required documents, debt service coverage and more",
  "Exceptions for missing, conflicting or stale information, and for hostile text",
  "A credit memo draft in which every statement cites a fact, a calculation or a rule",
  "An underwriter console: disposing exceptions, confirming facts, adopting the memo, recording the decision",
  "Roles, an audit trail and per-customer data isolation",
];

const NOT_YET = [
  "Eligibility screening (size standard, ineligible business types, affiliation)",
  "IRS tax transcripts, personal financial statements and credit reports",
  "Collateral and appraisals",
  "Existing business debt and global cash flow. Debt service today uses only the new loan at a placeholder 9% rate",
  "Franchise and insurance items, and the interest rate cap check",
  "SBA 504 and SBA Express",
];

export default async function WhyFortech() {
  await requireSession("view", "/why-fortech");
  return (
    <main>
      <div className="hero-band">
        <div className="eyebrow">Platform</div>
        <h1>Software prepares the file. People decide.</h1>
        <p>Fortech is an underwriting portal for commercial lending, starting with SBA 7(a) files. It does the preparation an underwriter would otherwise do by hand, and leaves every credit decision to a person.</p>
        <div className="chip-row">
          <span className="chip"><Icon name="check" size={14} />SBA 7(a) first</span>
          <span className="chip"><Icon name="check" size={14} />Evidence on every line</span>
          <span className="chip"><Icon name="check" size={14} />Human decision</span>
        </div>
      </div>

      <h2 className="section-title">What you get</h2>
      <p className="section-sub">Six things the portal is built around.</p>
      <div className="grid-3">
        <Feature icon="doc" title="Evidence on every line">Every extracted fact carries the document, page and passage it came from. Every memo statement cites a fact, a calculation or a rule. No citation, no fact.</Feature>
        <Feature icon="scale" title="Policy checks you can read">Rules are tested code, and every result shows the SBA SOP 50 10 section it comes from. You can see why a file passed or needs review.</Feature>
        <Feature icon="check" title="A person always decides">Only an authorized underwriter records approve, decline or request more information. Approving past an open critical or high exception needs a written override.</Feature>
        <Feature icon="files" title="Works from your documents">You upload the documents you already have: tax returns, bank statements and financial statements. The portal prepares the file around them.</Feature>
        <Feature icon="list" title="A tamper-evident record">Decisions, rule runs and memos are append-only, and audit events are hash-chained, so a change to history shows.</Feature>
        <Feature icon="eye" title="Honest about its limits">Each file run lists the checks the software did not perform, so a prepared file is never mistaken for a finished review.</Feature>
      </div>

      <h2 className="section-title">How Fortech is designed to be different</h2>
      <p className="section-sub">These are design answers. We describe what Fortech does and make no claims about other products.</p>
      <div className="table-wrap">
        <table className="compare">
          <thead><tr><th>The question</th><th>Fortech&apos;s answer</th></tr></thead>
          <tbody>{DESIGN.map(([q, a]) => <tr key={q}><td>{q}</td><td>{a}</td></tr>)}</tbody>
        </table>
      </div>

      <h2 className="section-title">Scope: today and next</h2>
      <p className="section-sub">The portal starts with SBA 7(a) file review and credit memo drafting.</p>
      <div className="grid-2">
        <div className="card"><div className="card-head"><h2>Built and working</h2></div><ul>{TODAY.map((t) => <li key={t}>{t}</li>)}</ul></div>
        <div className="card"><div className="card-head"><h2>Not built yet</h2></div><ul>{NOT_YET.map((t) => <li key={t}>{t}</li>)}</ul></div>
      </div>

      <Callout tone="honest" title="About this demo workspace">
        <p>This workspace holds synthetic data only. Extraction runs on a built-in stand-in model, and sign-in runs against a local stand-in identity provider. Accuracy on real documents has not been measured yet, and the portal makes no time-savings claim until it has been timed against a real baseline.</p>
      </Callout>

      <div className="chip-row" style={{ marginTop: 22 }}>
        <Link href="/how-the-ai-works" className="btn">See how the AI works <Icon name="arrow" size={16} /></Link>
        <Link href="/security-trust" className="btn" style={{ background: "#fff", color: "var(--ink)", border: "1px solid var(--line)" }}>Read about security <Icon name="arrow" size={16} /></Link>
      </div>
    </main>
  );
}
