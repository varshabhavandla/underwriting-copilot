import type { ReactNode } from "react";
import Link from "next/link";
import "./globals.css";
import { BRAND, Logo } from "./brand";
import { SessionBar } from "./session-bar";
import { TestBanner } from "./test-banner";

export const metadata = { title: `${BRAND.company} | ${BRAND.product}`, description: "Prepared files for human underwriters" };

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body>
        <TestBanner />
        <header className="site-header">
          <div className="site-header-inner">
            <Link href="/" className="brand">
              <Logo size={34} />
              <span><span className="brand-name">{BRAND.company}</span><span className="brand-sub">{BRAND.product}</span></span>
            </Link>
            <SessionBar />
          </div>
        </header>
        {children}
      </body>
    </html>
  );
}
