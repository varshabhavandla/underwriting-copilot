import type { ReactNode } from "react";

export const metadata = { title: "Underwriting Copilot", description: "Prepared files for human underwriters" };

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body style={{ fontFamily: "system-ui, sans-serif", maxWidth: 880, margin: "2rem auto", padding: "0 1rem" }}>{children}</body>
    </html>
  );
}
