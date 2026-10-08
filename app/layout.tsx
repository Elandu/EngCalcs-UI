import type { Metadata } from "next";
import "./globals.css";
import "./calculation-links.css";

export const metadata: Metadata = {
  title: "EngCalcs — AI-orchestrated engineering calculations",
  description:
    "Describe the engineering task. EngCalcs plans the calculation workflow, runs deterministic standards-based engines, and produces reviewable calculation outputs.",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
