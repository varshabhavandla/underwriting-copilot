import type { ReactNode } from "react";
import "./globals.css";
import { SessionBar } from "./session-bar";

export const metadata = { title: "Underwriting Copilot", description: "Prepared files for human underwriters" };

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body><div><SessionBar />{children}</div></body>
    </html>
  );
}
