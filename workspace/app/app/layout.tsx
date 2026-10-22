import type { ReactNode } from "react";
import "./globals.css";

export const metadata = { title: "Underwriting Copilot", description: "Prepared files for human underwriters" };

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body><div>{children}</div></body>
    </html>
  );
}
