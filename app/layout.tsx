import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Order Tool",
  description: "Branded online ordering for hospitality venues.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className="min-h-dvh bg-gray-50 text-gray-900 antialiased">{children}</body>
    </html>
  );
}
