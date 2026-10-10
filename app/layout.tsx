import type { Metadata } from "next";
import "./globals.css";
import "./calculation-links.css";
import "./brand-system.css";

export const metadata: Metadata = {
  title: "EngCalcs | Engineering calculations in context",
  description:
    "EngCalcs connects Australian wind and structural calculations with project inputs and run history. Engineering-led software with AI coordination in development.",
  applicationName: "EngCalcs",
  metadataBase: new URL("https://engcalcs.au"),
  openGraph: {
    title: "EngCalcs | Engineering calculations in context",
    description: "The calculation, its inputs and its history, together in one engineering workspace. AI project coordination in development.",
    url: "https://engcalcs.au",
    siteName: "EngCalcs",
    type: "website",
    locale: "en_AU",
    images: [{ url: "/opengraph-image", width: 1200, height: 630, alt: "EngCalcs engineering workspace" }],
  },
  twitter: {
    card: "summary_large_image",
    title: "EngCalcs | Engineering calculations in context",
    description: "Connected structural calculations and reviewable run history. AI-assisted project coordination in development.",
    images: ["/opengraph-image"],
  },
  icons: { icon: [{ url: "/icon.svg", type: "image/svg+xml" }] },
  robots: { index: true, follow: true },
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en-AU">
      <body>{children}</body>
    </html>
  );
}
