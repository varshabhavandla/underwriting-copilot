import type { ReactNode } from "react";
import { BRAND, Logo } from "./brand";

const POINTS = [
  "Every extracted fact carries its source citation.",
  "Policy rules are tested code, not model guesses.",
  "Only an authorized underwriter records a decision.",
];

/** The look shared by the pages a visitor sees before or after a session: a brand panel beside a card. Public by design: it shows no data. */
export function AuthShell({ children }: { children: ReactNode }) {
  return (
    <main className="auth-page">
      <section className="auth-hero">
        <div className="auth-brand">
          <Logo size={44} />
          <div>
            <div className="auth-company">{BRAND.company}</div>
            <div className="auth-product">{BRAND.product}</div>
          </div>
        </div>
        <div>
          <p className="auth-headline">Commercial lending files, prepared for a human decision.</p>
          <ul className="auth-points">
            {POINTS.map((p) => <li key={p}>{p}</li>)}
          </ul>
        </div>
        <p className="auth-foot">{BRAND.company}</p>
      </section>
      <section className="auth-panel">
        <div className="auth-card">{children}</div>
      </section>
    </main>
  );
}
