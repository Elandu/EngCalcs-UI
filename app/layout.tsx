import type { Metadata } from "next";
import "./globals.css";
import "./calculation-links.css";
import "./brand-system.css";

export const metadata: Metadata = {
  title: "EngCalcs | Connected engineering calculations",
  description:
    "EngCalcs connects engineering calculations, project inputs and review history in one workspace. Built for Australian structural engineers, with AI-assisted design coordination in development.",
  applicationName: "EngCalcs",
  metadataBase: new URL("https://engcalcs.au"),
  openGraph: {
    title: "EngCalcs | Engineering calculations in context",
    description: "Connected, reviewable engineering calculation software for Australian practice.",
    url: "https://engcalcs.au",
    siteName: "EngCalcs",
    type: "website",
    locale: "en_AU",
    images: [{ url: "/opengraph-image", width: 1200, height: 630, alt: "EngCalcs engineering workspace" }],
  },
  twitter: {
    card: "summary_large_image",
    title: "EngCalcs | Connected engineering calculations",
    description: "Deterministic calculations. Reviewable results. AI coordination in development.",
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
