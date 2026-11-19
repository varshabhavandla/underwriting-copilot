"use client";
import { usePathname } from "next/navigation";
import { useEffect, useState, type ReactNode } from "react";
import { Icon } from "./icons";

/**
 * The sidebar's frame. On wide screens it is the always-visible column and the menu button is hidden. On narrow screens only the brand row and the menu
 * button show, and the navigation opens beneath them. The menu closes when the visitor navigates (it is open only for the path it was opened on) and on
 * Escape. The brand and the navigation are rendered on the server and passed in.
 */
export function SidebarFrame({ brand, children }: { brand: ReactNode; children: ReactNode }) {
  const path = usePathname();
  const [openOn, setOpenOn] = useState<string | null>(null);
  const open = openOn === path;

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") setOpenOn(null); };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open]);

  return (
    <aside className={open ? "sidebar nav-open" : "sidebar"}>
      <div className="side-head">
        {brand}
        <button
          type="button"
          className="menu-toggle"
          aria-expanded={open}
          aria-controls="sidebar-panel"
          onClick={() => setOpenOn(open ? null : path)}
        >
          <Icon name={open ? "close" : "menu"} size={20} />
          <span className="sr-only">{open ? "Close menu" : "Open menu"}</span>
        </button>
      </div>
      <div id="sidebar-panel" className="side-panel">{children}</div>
    </aside>
  );
}
