import type { ReactNode } from "react";

export type IconName =
  | "dashboard" | "files" | "plus" | "spark" | "shield" | "target" | "clock" | "users" | "list" | "key" | "logout"
  | "check" | "arrow" | "lock" | "layers" | "eye" | "scale" | "doc" | "bolt" | "search" | "help";

const PATHS: Record<IconName, ReactNode> = {
  dashboard: <><rect x="3" y="3" width="7" height="9" rx="1.8" /><rect x="14" y="3" width="7" height="5" rx="1.8" /><rect x="14" y="12" width="7" height="9" rx="1.8" /><rect x="3" y="16" width="7" height="5" rx="1.8" /></>,
  files: <><path d="M7 3h7l5 5v13H7z" /><path d="M14 3v5h5" /><path d="M10 13h6M10 17h6" /></>,
  plus: <path d="M12 5v14M5 12h14" />,
  spark: <><path d="M12 3l2.2 5.8L20 11l-5.8 2.2L12 19l-2.2-5.8L4 11l5.8-2.2z" /><path d="M19 3v4M17 5h4" /></>,
  shield: <><path d="M12 3l7 3v5c0 5-3 8-7 10-4-2-7-5-7-10V6z" /><path d="M9 12l2 2 4-4" /></>,
  target: <><circle cx="12" cy="12" r="9" /><circle cx="12" cy="12" r="4.5" /><path d="M12 12h.01" /></>,
  clock: <><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 2" /></>,
  users: <><circle cx="9" cy="8" r="3.2" /><path d="M3 20c0-3.3 2.7-6 6-6s6 2.7 6 6" /><path d="M16 5.5a3 3 0 010 5.5M18 14.5c2 .6 3 2.5 3 5.5" /></>,
  list: <path d="M5 6h14M5 12h14M5 18h9" />,
  key: <><circle cx="8" cy="15" r="3.5" /><path d="M10.5 12.5L20 3M16 7l3 3" /></>,
  logout: <path d="M10 4H5v16h5M15 8l4 4-4 4M19 12H9" />,
  check: <path d="M5 12.5l4.5 4.5L19 7.5" />,
  arrow: <path d="M5 12h14M13 6l6 6-6 6" />,
  lock: <><rect x="5" y="11" width="14" height="10" rx="2" /><path d="M8 11V8a4 4 0 018 0v3" /></>,
  layers: <><path d="M12 3l9 5-9 5-9-5z" /><path d="M3 13l9 5 9-5" /></>,
  eye: <><path d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7S2 12 2 12z" /><circle cx="12" cy="12" r="3" /></>,
  scale: <><path d="M12 4v16M7 20h10M4 8h16" /><path d="M4 8l-2 6a3 3 0 006 0zM20 8l-2 6a3 3 0 006 0z" transform="translate(-1 0)" /></>,
  doc: <><path d="M6 3h9l4 4v14H6z" /><path d="M9 12h7M9 16h7M9 8h3" /></>,
  bolt: <path d="M13 3L5 14h6l-1 7 8-11h-6z" />,
  search: <><circle cx="11" cy="11" r="6.5" /><path d="M16 16l4.5 4.5" /></>,
  help: <><circle cx="12" cy="12" r="9" /><path d="M9.5 9.6a2.6 2.6 0 015.1.6c0 1.8-2.6 2.1-2.6 3.8M12 17.2h.01" /></>,
};

/** Small stroke icons, drawn inline so the portal loads nothing from other hosts. They take their colour from the surrounding text. */
export function Icon({ name, size = 20 }: { name: IconName; size?: number }) {
  return (
    <svg className="icon" width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false">
      {PATHS[name]}
    </svg>
  );
}
