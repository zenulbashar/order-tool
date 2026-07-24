import type { Metadata, Viewport } from "next";
import { Bricolage_Grotesque, Hanken_Grotesk, Space_Mono } from "next/font/google";

import { Analytics } from "@/app/_components/analytics";
import {
  SITE_DESCRIPTION,
  SITE_KEYWORDS,
  SITE_NAME,
  SITE_TAGLINE,
  SITE_URL,
} from "@/lib/seo";

import "./globals.css";

// Display / headlines / wordmark. Variable font (wght included by default);
// add the opsz axis for optical sizing. Exposed via --font-display.
const bricolage = Bricolage_Grotesque({
  subsets: ["latin"],
  display: "swap",
  axes: ["opsz"],
  variable: "--font-bricolage",
});

// Body / UI and the app's default sans. Variable font. Exposed via --font-body.
const hanken = Hanken_Grotesk({
  subsets: ["latin"],
  display: "swap",
  variable: "--font-hanken",
});

// Mono / labels / AI-prompt / data. Non-variable, so weights are explicit.
const spaceMono = Space_Mono({
  subsets: ["latin"],
  display: "swap",
  weight: ["400", "700"],
  variable: "--font-space-mono",
});

export const metadata: Metadata = {
  // Absolute base for canonical/OG URLs (per-page `alternates.canonical` and
  // the opengraph-image route resolve against this).
  metadataBase: new URL(SITE_URL),
  title: {
    default: `${SITE_NAME} — ${SITE_TAGLINE}`,
    template: `%s · ${SITE_NAME}`,
  },
  description: SITE_DESCRIPTION,
  applicationName: SITE_NAME,
  keywords: SITE_KEYWORDS,
  // Social-card defaults; pages inherit and may override. The image comes from
  // app/opengraph-image.tsx (the brand card) via the file convention.
  openGraph: {
    type: "website",
    siteName: SITE_NAME,
    title: `${SITE_NAME} — ${SITE_TAGLINE}`,
    description: SITE_DESCRIPTION,
    url: SITE_URL,
    locale: "en_AU",
  },
  twitter: {
    card: "summary_large_image",
    title: `${SITE_NAME} — ${SITE_TAGLINE}`,
    description: SITE_DESCRIPTION,
  },
  // Prompt2Eat brand identity (from the logo kit) for the platform's own
  // surfaces (owner dashboard, sign-in, marketing): the SVG favicon + an .ico
  // fallback, the apple-touch icon, and the PWA manifest. Diner pages override
  // the icon per-venue with the venue's own logo (see app/[slug]/layout.tsx).
  icons: {
    icon: [
      { url: "/favicon.svg", type: "image/svg+xml" },
      { url: "/favicon.ico", sizes: "any" },
    ],
    apple: "/icons/apple-touch-icon.png",
  },
  manifest: "/site.webmanifest",
  // Google Search Console ownership proof (the HTML-tag method). Env-driven so
  // previews emit nothing; set GOOGLE_SITE_VERIFICATION to the content value
  // from Search Console, then verify + submit /sitemap.xml there.
  ...(process.env.GOOGLE_SITE_VERIFICATION
    ? { verification: { google: process.env.GOOGLE_SITE_VERIFICATION } }
    : {}),
};

// theme-color drives the mobile browser chrome + PWA splash (forest ink).
export const viewport: Viewport = {
  themeColor: "#16241C",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`${bricolage.variable} ${hanken.variable} ${spaceMono.variable}`}
    >
      <body className="min-h-dvh bg-surface text-ink antialiased">
        {children}
        {/* GA4 — renders only when NEXT_PUBLIC_GA_ID is set. */}
        <Analytics />
      </body>
    </html>
  );
}
