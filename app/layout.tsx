import type { Metadata } from "next";
import "./globals.css";
import "./calculation-links.css";

export const metadata: Metadata = {
  title: "OpenCalcs — Engineering calculations, connected",
  description:
    "A modern engineering calculation workspace for transparent, standards-referenced calculations, projects and reports.",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
