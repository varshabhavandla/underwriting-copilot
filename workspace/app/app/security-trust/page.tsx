import Link from "next/link";
import { requireSession } from "@/server/guard";
import { Icon } from "../icons";
import { Callout, Feature } from "../ui";

export const dynamic = "force-dynamic";
export const metadata = { title: "Security & trust | Fortech Underwriting Portal" };

const ROLES: [string, string][] = [
  ["Viewer", "Reads files, facts, rule results and memos. Cannot change anything."],
  ["Processor", "Everything a viewer can do, plus submitting applications, uploading documents and building the file."],
  ["Underwriter", "Everything a processor can do, plus disposing exceptions, adopting the memo and recording the decision. The only role that decides."],
  ["Admin", "Manages users, single sign-on and the security events screen. Cannot record a credit decision."],
];

const NOT_YET = [
  "No third-party penetration test yet",
  "No SOC 2 report yet, and no signed builds or static analysis in the pipeline yet",
  "Rate limiting works per server instance, not across several",
  "Sign-in is tested against a local stand-in identity provider. Choosing the customer's real provider is still open",
  "Behavior against a real model and real documents is not yet measured",
  "Items for legal and compliance review are listed and open. Nothing here is legal advice",
];

export default async function SecurityTrust() {
  await requireSession("view", "/security-trust");
  return (
    <main>
      <div className="hero-band">
        <div className="eyebrow">Platform</div>
        <h1>Built to protect lending data, and to prove it.</h1>
        <p>Security is enforced where it cannot be skipped: in the database, in the encryption and in an audit trail that shows tampering. Each control below is tested, and the limits are stated at the end.</p>
        <div className="chip-row">
          <span className="chip"><Icon name="lock" size={14} />Isolated per customer</span>
          <span className="chip"><Icon name="shield" size={14} />Encrypted at rest</span>
          <span className="chip"><Icon name="list" size={14} />Append-only audit</span>
        </div>
      </div>

      <h2 className="section-title">How your data is protected</h2>
      <p className="section-sub">Six layers, each checked by an automated test.</p>
      <div className="grid-3">
        <Feature icon="lock" title="Your data stays yours">The database enforces row-level security on every table. The application cannot bypass it, and a request for another customer&apos;s file gets the same answer as a file that does not exist. Tests prove the denial and pair it with a control that succeeds.</Feature>
        <Feature icon="shield" title="Encrypted at rest">Documents and sensitive identifiers are encrypted with AES-256-GCM using a separate key for each customer. A taxpayer ID is stored encrypted, and only its last four digits are shown.</Feature>
        <Feature icon="key" title="Sign-in without passwords">Sign-in uses OpenID Connect with PKCE through your own identity provider. Fortech stores no passwords. Sessions are revocable, and a role change applies on the very next request.</Feature>
        <Feature icon="doc" title="Hostile documents are contained">Document text is untrusted data. The step that reads it has no tools, its output is schema-checked, every value must cite a real passage, and instruction-like text is flagged for a person.</Feature>
        <Feature icon="list" title="History cannot be rewritten">Decisions, rule runs, memos and audit events are append-only. Audit events are hash-chained per customer, and the chain can be verified. A decided file is final.</Feature>
        <Feature icon="eye" title="Logs hold no secrets">Logs carry no taxpayer IDs, business names or tokens. The end-to-end tests check the server log after a full run. Uploads are malware-scanned, and if the scanner is down they are refused.</Feature>
      </div>

      <h2 className="section-title">Who can do what</h2>
      <p className="section-sub">Four roles. Only one of them can decide.</p>
      <div className="table-wrap">
        <table className="compare">
          <thead><tr><th>Role</th><th>What it can do</th></tr></thead>
          <tbody>{ROLES.map(([r, t]) => <tr key={r}><td>{r}</td><td>{t}</td></tr>)}</tbody>
        </table>
      </div>

      <h2 className="section-title">How we check ourselves</h2>
      <div className="grid-2" style={{ marginTop: 12 }}>
        <Feature icon="layers" title="A threat model tied to tests">We keep a STRIDE threat model over the built components, and the controls it names are covered by automated tests that fail if a control is weakened.</Feature>
        <Feature icon="target" title="A published self-assessment">We assess ourselves against OWASP ASVS 5.0 Level 2 and keep the results in the repository. This is a self-assessment, not a certification.</Feature>
      </div>

      <Callout tone="honest" title="What is not done yet">
        <ul>{NOT_YET.map((n) => <li key={n}>{n}</li>)}</ul>
      </Callout>

      <div className="chip-row" style={{ marginTop: 22 }}>
        <Link href="/how-the-ai-works" className="btn">See how the AI works <Icon name="arrow" size={16} /></Link>
        <Link href="/why-fortech" className="btn" style={{ background: "#fff", color: "var(--ink)", border: "1px solid var(--line)" }}>Why Fortech <Icon name="arrow" size={16} /></Link>
      </div>
    </main>
  );
}
