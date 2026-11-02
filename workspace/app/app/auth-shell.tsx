import type { ReactNode } from "react";
import { BRAND, Logo } from "./brand";
import { Icon, type IconName } from "./icons";

const POINTS: { icon: IconName; title: string; text: string }[] = [
  { icon: "doc", title: "Evidence on every line", text: "Each extracted fact and memo statement links to the exact passage it came from." },
  { icon: "scale", title: "Policy checks you can read", text: "Rules mapped to SBA SOP 50 10 are tested code, not model guesses." },
  { icon: "check", title: "A person always decides", text: "Only an authorized underwriter records a decision, with written reasons." },
];

const TRUST: { icon: IconName; text: string }[] = [
  { icon: "lock", text: "Each customer's data is isolated" },
  { icon: "shield", text: "Documents encrypted at rest" },
  { icon: "list", text: "Append-only audit trail" },
];

/** An illustrative card, not live data: it shows what a cited fact and an exception look like in the portal. */
function Preview() {
  return (
    <div className="mock" aria-hidden="true">
      <p className="mock-cap"><span>Example file</span><span>Illustration</span></p>
      <div className="mock-row"><span className="mock-key">Net income, 2025 tax return</span><span className="mock-val">$357,664.36 <span className="pill pill-accepted">accepted</span></span></div>
      <p className="mock-cite">p.1: “Net income: $357,664.36”</p>
      <div className="mock-row"><span className="mock-key">Document contains instruction-like text</span><span className="pill pill-critical">critical</span></div>
      <div className="mock-row"><span className="mock-key">Credit memo</span><span className="pill pill-proposed">draft, every line cited</span></div>
      <div className="mock-row"><span className="mock-key">Decision</span><span className="mock-val">Waiting for an underwriter</span></div>
    </div>
  );
}

/** The look shared by the pages a visitor sees before or after a session: a story-led brand panel beside a card. Public by design: it shows no data. */
export function AuthShell({ children }: { children: ReactNode }) {
  return (
    <main className="auth-page">
      <section className="auth-hero">
        <div className="auth-brand">
          <Logo size={46} />
          <div>
            <div className="auth-company">{BRAND.company}</div>
            <div className="auth-product">{BRAND.product}</div>
          </div>
        </div>
        <div>
          <div className="auth-eyebrow"><Icon name="spark" size={16} />AI-assisted commercial lending</div>
          <p className="auth-headline">Every file prepared with evidence. Every decision made by a person.</p>
          <p className="auth-sub">Fortech reads the documents, checks each fact against its source and your policy, and drafts a cited credit memo. Your underwriter makes the call.</p>
          <ul className="auth-points">
            {POINTS.map((p) => (
              <li key={p.title}><span className="icon-chip"><Icon name={p.icon} size={18} /></span><div><b>{p.title}</b><span>{p.text}</span></div></li>
            ))}
          </ul>
          <Preview />
        </div>
        <p className="auth-trust">{TRUST.map((t) => <span key={t.text}><Icon name={t.icon} size={15} />{t.text}</span>)}</p>
      </section>
      <section className="auth-panel">
        <div className="auth-card">
          <div className="card-logo"><Logo size={40} /></div>
          {children}
        </div>
      </section>
    </main>
  );
}
