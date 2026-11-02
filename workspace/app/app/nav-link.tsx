"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";

/** A sidebar link that marks the section the visitor is in (the page itself or anything below it). */
export function NavLink({ href, children }: { href: string; children: ReactNode }) {
  const path = usePathname();
  const active = path === href || path.startsWith(`${href}/`);
  return (
    <Link href={href} className={active ? "nav-item active" : "nav-item"} aria-current={active ? "page" : undefined}>
      {children}
    </Link>
  );
}
