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

  return (
    <div className="admin-dark min-h-screen bg-surface text-ink">
      <AdminNav email={email} />
      {children}
    </div>
  );
}
