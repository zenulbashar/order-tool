"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

import { signOutCustomer } from "./actions";

/**
 * Account section nav (design panel 18). A left rail on desktop, a horizontal
 * scrollable row on mobile. Active item detected from the pathname. Sign-out and
 * the signed-in email live here (moved off the orders list), so the rail is the
 * single home for identity + navigation across the account sub-pages.
 */
const ITEMS = [
  { key: "orders", label: "Orders", suffix: "" },
  { key: "details", label: "Your details", suffix: "/details" },
  { key: "payment", label: "Saved payment", suffix: "/payment" },
  { key: "notifications", label: "Notifications", suffix: "/notifications" },
];

export function AccountNav({ slug, email }: { slug: string; email: string }) {
  const pathname = usePathname();
  const base = `/${slug}/account`;

  return (
    <aside className="px-5 pt-4 lg:px-0 lg:pt-0">
      <p className="truncate text-xs text-muted">
        Signed in as <span className="font-medium text-ink">{email}</span>
      </p>
      <nav className="mt-2 lg:mt-3">
        {/*
            Four items overflow at 360px with no fade and no arrow, so
            "Notifications" was invisible and undiscoverable (UI audit P1-9).
            The negative margin + matching padding lets the row bleed to the
            screen edge so the cut-off item reads as scrollable; the mask makes
            that legible; snap-x stops it resting mid-item. All undone at lg,
            where the nav is a vertical column.
          */}
        <ul className="-mx-5 flex snap-x gap-1 overflow-x-auto px-5 [mask-image:linear-gradient(90deg,#000_calc(100%-28px),transparent)] [scrollbar-width:none] lg:mx-0 lg:flex-col lg:gap-0.5 lg:px-0 lg:[mask-image:none] [&::-webkit-scrollbar]:hidden">
          {ITEMS.map((item) => {
            const href = `${base}${item.suffix}`;
            const active =
              item.suffix === "" ? pathname === base : pathname === href;
            return (
              <li key={item.key} className="shrink-0">
                <Link
                  href={href}
                  aria-current={active ? "page" : undefined}
                  className={`flex min-h-11 snap-start items-center whitespace-nowrap rounded-control px-3 text-sm font-medium transition lg:min-h-0 lg:py-2 ${
                    active
                      ? "bg-[var(--diner-tint)] text-ink"
                      : "text-muted hover:bg-hover-ghost hover:text-ink"
                  }`}
                >
                  {item.label}
                </Link>
              </li>
            );
          })}
        </ul>
      </nav>
      <form action={signOutCustomer} className="mt-3">
        <button
          type="submit"
          className="text-xs font-medium text-muted underline hover:text-ink"
        >
          Sign out
        </button>
      </form>
    </aside>
  );
}
