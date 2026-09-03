import type { Metadata } from "next";

import { requirePlatformAdmin } from "@/lib/platform-admin";

import { AdminNav } from "./admin-nav";

// noindex belt-and-braces alongside robots.txt (see dashboard/layout.tsx).
export const metadata: Metadata = {
  robots: { index: false, follow: false },
};

/**
 * Platform admin console shell (P2E-Admin). A dark "ops" surface distinct from
 * the owner app: the `.admin-dark` wrapper scopes a dark token override (see
 * globals.css) so every admin page recolours to the ops theme, and the operator
 * top-nav sits above the content. Gated here too (not just per page) so the
 * console — including its nav — never renders for non-operators.
 */
export default async function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const { email } = await requirePlatformAdmin();
  // The header pill used to be the literal "Prod", so preview and local
  // consoles also claimed to be production. Vercel sets VERCEL_ENV per
  // deployment; anything else is a local run.
  const environment =
    process.env.VERCEL_ENV === "production"
      ? "Prod"
      : process.env.VERCEL_ENV === "preview"
        ? "Preview"
        : "Local";

  return (
    // min-h-dvh, not min-h-screen: the rest of the app already uses dvh, and
    // 100vh produces the classic jump under mobile browser chrome (UI audit P1-7).
    <div className="admin-dark min-h-dvh bg-surface text-ink">
      <AdminNav email={email} environment={environment} />
      {children}
    </div>
  );
}
