import type { Metadata } from "next";
import "./globals.css";
import "./calculation-links.css";

export const metadata: Metadata = {
  title: "EngCalcs | Connected engineering calculations",
  description:
    "EngCalcs connects engineering calculations, project inputs and review history in one workspace. Built for Australian structural engineers, with AI-assisted design coordination in development.",
  applicationName: "EngCalcs",
  robots: { index: true, follow: true },
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en-AU">
      <body>{children}</body>
    </html>
  );
}
