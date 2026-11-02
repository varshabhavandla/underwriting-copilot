import Link from "next/link";
import { requireSession } from "@/server/guard";
import { Icon } from "../icons";
import { ActorTag, Callout, Feature, type Actor } from "../ui";

export const dynamic = "force-dynamic";
export const metadata = { title: "How the AI works | Fortech Underwriting Portal" };

const STEPS: { title: string; who: Actor[]; text: string }[] = [
  { title: "Intake", who: ["Person"], text: "A processor submits the application and uploads the documents: tax returns, bank statements and financial statements, as PDF, image or text files up to 4 MB each." },
  { title: "Scan and read", who: ["System"], text: "Each upload is scanned for malware, and readable text is extracted in the background with live progress on the case page. Files that cannot be read automatically are routed to manual reading. If the scanner is unavailable, the upload is refused." },
  { title: "The AI proposes facts", who: ["AI"], text: "A model reads the document text, passed as a fenced block of data, and returns structured facts only: a value, the page and the passage it came from. It has no tools and no authority." },
  { title: "Code verifies every fact", who: ["Code"], text: "A fact is accepted only if its cited passage really appears in the source text. Numbers are recomputed by code. Anything that cannot be verified stays a proposal for an underwriter to confirm or reject." },
  { title: "Rules and exceptions", who: ["Code"], text: "Tested rules mapped to SBA SOP 50 10 run on the accepted facts. Missing, conflicting or stale information, and instruction-like text in a document, become exceptions with a severity." },
  { title: "A cited memo draft", who: ["AI", "Code"], text: "The AI drafts the credit memo. Every statement carries a citation to a fact, a calculation or a rule, and the figures are checked against what they cite. A draft that fails the check is rejected and raised as an exception instead of being stored." },
  { title: "The underwriter decides", who: ["Person"], text: "An underwriter works through the exceptions with written notes, confirms or rejects proposed facts, adopts the memo and records approve, decline or request more information, with reasons and any override." },
  { title: "The record is kept", who: ["System"], text: "The decision is appended to a hash-chained audit trail with the reviewer, the policy version, the reasons and the overrides. A decided file is final, and a correction is a new entry." },
];

export default async function HowTheAiWorks() {
  await requireSession("view", "/how-the-ai-works");
  return (
    <main>
      <div className="hero-band">
        <div className="eyebrow">Platform</div>
        <h1>From documents to a cited memo, with a person in charge.</h1>
        <p>The AI does the reading and the drafting. Tested code checks its work. A person makes every decision. Here is the path a file takes, and who does each step.</p>
        <div className="chip-row">
          <span className="chip"><ActorTag who="AI" /> reads and drafts</span>
          <span className="chip"><ActorTag who="Code" /> verifies and calculates</span>
          <span className="chip"><ActorTag who="Person" /> decides</span>
        </div>
      </div>

      <ol className="steps">
        {STEPS.map((s) => (
          <li key={s.title} className="step">
            <div>
              <h3>{s.title}{s.who.map((w) => <ActorTag key={w} who={w} />)}</h3>
              <p>{s.text}</p>
            </div>
          </li>
        ))}
      </ol>

      <h2 className="section-title">Guardrails around the AI</h2>
      <p className="section-sub">The design assumes the model can be wrong and the documents can be hostile.</p>
      <div className="grid-3">
        <Feature icon="lock" title="Reading has no authority">The step that reads documents has no tools that change anything or record a decision. Even a successful trick on the model can only produce a wrong proposal, which the later steps must catch.</Feature>
        <Feature icon="check" title="Code checks the AI">A fact needs a citation that exists in the source, and numbers are re-derived. The model&apos;s own confidence never decides whether a fact is accepted.</Feature>
        <Feature icon="shield" title="Hostile text is flagged">Instruction-like text in a document raises a critical exception for a person. It never changes a decision, because the AI cannot make one.</Feature>
      </div>

      <h2 className="section-title">What the AI can and cannot do</h2>
      <div className="grid-2" style={{ marginTop: 12 }}>
        <div className="card"><div className="card-head"><h2>It can</h2></div><ul>
          <li>Read documents and propose facts with citations</li>
          <li>Draft a credit memo from verified facts, calculations and rule results</li>
          <li>Save an underwriter the preparation work</li>
        </ul></div>
        <div className="card"><div className="card-head"><h2>It cannot</h2></div><ul>
          <li>Approve, decline or return a file</li>
          <li>Change a rule, a policy version or a past record</li>
          <li>Accept a fact that has no verifiable citation</li>
        </ul></div>
      </div>

      <h2 className="section-title">Real time, not batch</h2>
      <p className="section-sub">Documents are processed in the background. The case page and the dashboard update by themselves as each document finishes, so nobody waits on a spinner or reloads the page.</p>

      <Callout tone="honest" title="What this demo does and does not show">
        <ul>
          <li>It runs on synthetic documents with a built-in stand-in model that reads printed labels. A real model provider is an opt-in integration that is not part of this demo.</li>
          <li>Accuracy on real documents is not yet measured, so it is not claimed.</li>
          <li>No time-savings figure is claimed. That needs a timed comparison against a real baseline.</li>
        </ul>
      </Callout>

      <div className="chip-row" style={{ marginTop: 22 }}>
        <Link href="/review" className="btn">Open a file and follow it <Icon name="arrow" size={16} /></Link>
        <Link href="/security-trust" className="btn" style={{ background: "#fff", color: "var(--ink)", border: "1px solid var(--line)" }}>Read about security <Icon name="arrow" size={16} /></Link>
      </div>
    </main>
  );
}
