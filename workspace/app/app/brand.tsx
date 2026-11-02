export const BRAND = { company: "Fortech Technologies", product: "Underwriting Portal" } as const;

/** The Fortech mark: a stylised F with a small accent block. Inline SVG, so the portal loads nothing from other hosts; colours come from the stylesheet. */
export function Logo({ size = 32 }: { size?: number }) {
  return (
    <svg className="logo" width={size} height={size} viewBox="0 0 32 32" role="img" aria-label={`${BRAND.company} logo`} xmlns="http://www.w3.org/2000/svg">
      <rect className="logo-bg" width="32" height="32" rx="8" />
      <path className="logo-mark" d="M9.5 8h13.2v4.2h-8.9v3.1h6.6v4.1h-6.6V24H9.5z" />
      <rect className="logo-accent" x="21.2" y="19.8" width="4.3" height="4.2" rx="1" />
    </svg>
  );
}
