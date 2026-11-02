import Link from "next/link";
import type { ReactNode } from "react";
import { can } from "@/auth/roles";
import type { Role } from "@/auth/session";
import { authEnabled, services } from "@/server/services";
import { BRAND, Logo } from "./brand";
import { Icon, type IconName } from "./icons";
import { NavLink } from "./nav-link";

interface Item { href: string; label: string; icon: IconName }

const PLATFORM: Item[] = [
  { href: "/why-fortech", label: "Why Fortech", icon: "target" },
  { href: "/how-the-ai-works", label: "How the AI works", icon: "spark" },
  { href: "/security-trust", label: "Security & trust", icon: "shield" },
  { href: "/faq", label: "FAQ", icon: "help" },
];

const ADMIN: Item[] = [
  { href: "/admin/users", label: "Users", icon: "users" },
  { href: "/admin/audit", label: "Security events", icon: "list" },
  { href: "/admin/sso", label: "Single sign-on", icon: "key" },
];

function Group({ label, items }: { label: string; items: Item[] }) {
  return (
    <div className="nav-group">
      <p className="nav-label">{label}</p>
      {items.map((i) => <NavLink key={i.href} href={i.href}><Icon name={i.icon} />{i.label}</NavLink>)}
    </div>
  );
}

function BrandLink({ href, light }: { href: string; light?: boolean }) {
  return (
    <Link href={href} className={light ? "side-brand" : "brand"}>
      <Logo size={36} />
      <span><span className="brand-name">{BRAND.company}</span><span className="brand-sub">{BRAND.product}</span></span>
    </Link>
  );
}

/**
 * The frame around every page. Signed in: a sidebar and a top bar. Not signed in, or sign-in not configured: a plain brand header, which the public
 * pages hide because they draw their own full-screen layout. Never fails the page because of the frame (a build or a misconfigured environment).
 */
export async function AppShell({ children }: { children: ReactNode }) {
  let role: Role | undefined;
  try {
    if (authEnabled()) role = (await services())?.role;
  } catch {
    role = undefined;
  }
  if (!role) {
    return (
      <>
        <header className="site-header"><div className="site-header-inner"><BrandLink href="/" light /></div></header>
        {children}
      </>
    );
  }
  const workspace: Item[] = [
    { href: "/dashboard", label: "Dashboard", icon: "dashboard" },
    { href: "/review", label: "Files", icon: "files" },
    ...(can(role, "intake") ? [{ href: "/apply", label: "New application", icon: "plus" as const }] : []),
  ];
  return (
    <div className="shell">
      <aside className="sidebar">
        <BrandLink href="/dashboard" light />
        <nav aria-label="Primary" className="nav">
          <Group label="Workspace" items={workspace} />
          <Group label="Platform" items={PLATFORM} />
          <Group label="Account" items={[{ href: "/account", label: "Your sessions", icon: "clock" }]} />
          {can(role, "admin") ? <Group label="Admin" items={ADMIN} /> : null}
        </nav>
        <p className="side-note">The software prepares the file. Only an underwriter decides.</p>
      </aside>
      <div className="content">
        <header className="topbar">
          <span className="who"><span className="avatar" aria-hidden="true">{role.charAt(0).toUpperCase()}</span>Signed in ({role})</span>
          <form action="/api/auth/logout" method="post"><button type="submit" className="btn-ghost"><Icon name="logout" size={16} />Sign out</button></form>
        </header>
        {children}
      </div>
    </div>
  );
}
