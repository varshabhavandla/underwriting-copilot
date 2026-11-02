import type { ReactNode } from "react";
import "./globals.css";
import { AppShell } from "./app-shell";
import { BRAND } from "./brand";
import { TestBanner } from "./test-banner";

export const metadata = { title: `${BRAND.company} | ${BRAND.product}`, description: "Prepared files for human underwriters" };

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body>
        <TestBanner />
        <AppShell>{children}</AppShell>
      </body>
    </html>
  );
}
