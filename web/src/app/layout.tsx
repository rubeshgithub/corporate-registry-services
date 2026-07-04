import type { Metadata } from "next";
import { Playfair_Display, Plus_Jakarta_Sans, IBM_Plex_Mono } from "next/font/google";
import "./globals.css";

const playfair = Playfair_Display({
  variable: "--font-display",
  subsets: ["latin"],
  display: "swap",
});

const jakarta = Plus_Jakarta_Sans({
  variable: "--font-body",
  subsets: ["latin"],
  display: "swap",
});

const ibmMono = IBM_Plex_Mono({
  variable: "--font-mono",
  subsets: ["latin"],
  weight: ["400", "500"],
  display: "swap",
});

// Same convention as sitemap.ts — this is what Next.js resolves relative
// canonical URLs against, so we don't have to duplicate the base URL in
// every generateMetadata function.
const BASE_URL = process.env.NEXT_PUBLIC_SITE_URL ?? "https://www.corporateregistryservices.ca";

export const metadata: Metadata = {
  metadataBase: new URL(BASE_URL),
  title: "CRS — Canadian Corporate Registry Services",
  description:
    "Corporate profile reports, certificates of good standing, annual returns, incorporations, and minute books across all 13 Canadian jurisdictions.",
  openGraph: {
    title: "CRS — Canadian Corporate Registry Services",
    description:
      "Fast, official corporate filings and searches across all Canadian provinces and territories.",
    siteName: "CRS — Corporate Registry Services",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`${playfair.variable} ${jakarta.variable} ${ibmMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col bg-[var(--bg)] text-[var(--text)]">
        {children}
      </body>
    </html>
  );
}
