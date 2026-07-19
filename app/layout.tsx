import type { Metadata, Viewport } from "next";
import { Bricolage_Grotesque, Hanken_Grotesk, Space_Mono } from "next/font/google";
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
  title: "Prompt2Eat",
  description: "Branded online ordering for hospitality venues.",
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
      <body className="min-h-dvh bg-surface text-ink antialiased">{children}</body>
    </html>
  );
}
