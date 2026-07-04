"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

import { cx } from "@/app/_components/cx";

/**
 * Operator top-nav for the platform admin console (P2EAdminBar). Rendered inside
 * the dark `.admin-dark` scope, so the token utilities resolve to the ops theme.
 */
const TABS = [
  { href: "/admin", label: "Directory" },
  { href: "/admin/stats", label: "Stats" },
  { href: "/admin/promotions", label: "Promotions" },
  { href: "/admin/marketplace", label: "Marketplace" },
];

export function AdminNav({ email }: { email: string }) {
  const pathname = usePathname();
  const active = (href: string) =>
    href === "/admin"
      ? pathname === "/admin" || pathname.startsWith("/admin/venues")
      : pathname.startsWith(href);
  const initials = email.slice(0, 2).toUpperCase();

  return (
    <header className="sticky top-0 z-20 flex flex-wrap items-center gap-x-4 gap-y-2 border-b border-line bg-surface px-5 py-3">
      <div className="flex items-center gap-2">
        <span className="font-display text-base font-extrabold tracking-tight text-ink">
          Prompt2Eat
        </span>
        <span className="rounded-[5px] bg-[var(--color-accent)] px-1.5 py-0.5 font-mono text-[9px] font-bold uppercase tracking-wider text-forest">
          Ops
        </span>
      </div>

      <nav className="flex items-center gap-1">
        {TABS.map((tab) => (
          <Link
            key={tab.href}
            href={tab.href}
            className={cx(
              "rounded-control px-3 py-1.5 text-sm font-semibold transition",
              active(tab.href)
                ? "bg-[var(--color-accent)] text-forest"
                : "text-muted hover:text-ink",
            )}
          >
            {tab.label}
          </Link>
        ))}
      </nav>

      <div className="ml-auto flex items-center gap-3">
        <span className="rounded-full border border-line-strong px-2.5 py-1 font-mono text-[9px] font-bold uppercase tracking-wider text-muted">
          Prod
        </span>
        <span
          title={email}
          className="flex h-8 w-8 items-center justify-center rounded-full bg-[var(--color-accent)] font-mono text-[10px] font-bold text-forest"
        >
          {initials}
        </span>
      </div>
    </header>
  );
}
