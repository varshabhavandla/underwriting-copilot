import type { ReactNode } from "react";
import { Icon, type IconName } from "./icons";

/** The title block at the top of a page: a small label, the title, a one-line explanation and optional actions on the right. */
export function PageHeader({ eyebrow, title, subtitle, children }: { eyebrow?: string; title: string; subtitle?: string; children?: ReactNode }) {
  return (
    <div className="page-head">
      <div>
        {eyebrow ? <div className="eyebrow">{eyebrow}</div> : null}
        <h1>{title}</h1>
        {subtitle ? <p className="lede">{subtitle}</p> : null}
      </div>
      {children ? <div className="page-head-actions">{children}</div> : null}
    </div>
  );
}

/** A feature card: an icon, a short heading and a plain sentence. */
export function Feature({ icon, title, children }: { icon: IconName; title: string; children: ReactNode }) {
  return (
    <div className="card feature">
      <span className="icon-chip"><Icon name={icon} size={22} /></span>
      <h3>{title}</h3>
      <p>{children}</p>
    </div>
  );
}

/** A highlighted note. `tone` "honest" is used wherever the portal says plainly what is not built or not yet proven. */
export function Callout({ tone = "info", title, children }: { tone?: "info" | "honest"; title: string; children: ReactNode }) {
  return (
    <aside className={`callout callout-${tone}`}>
      <strong>{title}</strong>
      <div>{children}</div>
    </aside>
  );
}

/** Who performs a step. The point of the portal is that the person doing it is never hidden. */
export type Actor = "Person" | "AI" | "Code" | "System";
export function ActorTag({ who }: { who: Actor }) {
  return <span className={`actor actor-${who.toLowerCase()}`}>{who}</span>;
}
