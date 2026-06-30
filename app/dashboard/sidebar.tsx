"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import type { ReactNode } from "react";

import { cx } from "@/app/_components/cx";

import { signOutOwner } from "./actions";
import { VenueSwitcher } from "./venue-switcher";

type NavItem = {
  label: string;
  href: string;
  icon: ReactNode;
  /** Exact-match only (Overview), else section-prefix match. */
  exact?: boolean;
  /** External link (Storefront) — opens a new tab, never "active". */
  external?: boolean;
  /** Optional live count pill (e.g. active orders); hidden when 0. */
  badge?: number;
};

/** Two grouped sections, per the P2ESidebar reference. */
function navGroups(
  slug: string,
  activeOrderCount: number,
): { title: string; items: NavItem[] }[] {
  return [
    {
      title: "Manage",
      items: [
        { label: "Overview", href: "/dashboard", icon: <IconHome />, exact: true },
        { label: "Menu", href: "/dashboard/menu", icon: <IconMenu /> },
        {
          label: "Orders",
          href: "/dashboard/orders",
          icon: <IconOrders />,
          badge: activeOrderCount,
        },
        { label: "Tables", href: "/dashboard/tables", icon: <IconTables /> },
        { label: "Storefront", href: `/${slug}`, icon: <IconStorefront />, external: true },
      ],
    },
    {
      title: "Business",
      items: [
        { label: "Settings", href: "/dashboard/settings", icon: <IconSettings /> },
        { label: "Payments", href: "/dashboard/payments", icon: <IconPayments /> },
        { label: "Billing", href: "/dashboard/billing", icon: <IconBilling /> },
      ],
    },
  ];
}

const PLAN_LABEL: Record<string, string> = {
  trial: "Trial",
  pro: "Pro",
  scale: "Scale",
  free: "Free",
};

export function Sidebar({
  venues,
  currentId,
  currentName,
  currentSlug,
  plan,
  userName,
  userEmail,
  hasMultiple,
  activeOrderCount,
}: {
  venues: { id: string; name: string }[];
  currentId: string;
  currentName: string;
  currentSlug: string;
  plan: string;
  userName: string | null;
  userEmail: string | null;
  hasMultiple: boolean;
  activeOrderCount: number;
}) {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);

  // Closing the drawer is driven by the nav links' onClick (close-on-navigate),
  // not a route-watching effect — keeps state changes out of effects.
  const closeDrawer = () => setOpen(false);

  const groups = navGroups(currentSlug, activeOrderCount);

  function isActive(item: NavItem): boolean {
    if (item.external) return false;
    return item.exact
      ? pathname === item.href
      : pathname === item.href || pathname.startsWith(`${item.href}/`);
  }

  return (
    <>
      {/* Mobile header — logo + hamburger. Hidden on desktop and in print. */}
      <div className="sticky top-0 z-30 flex items-center justify-between bg-sidebar px-4 py-3 text-sidebar-ink lg:hidden print:hidden">
        <Brand />
        <button
          type="button"
          aria-label="Open navigation"
          aria-expanded={open}
          onClick={() => setOpen(true)}
          className="flex h-11 w-11 items-center justify-center rounded-control text-sidebar-ink transition hover:bg-forest"
        >
          <IconHamburger />
        </button>
      </div>

      {/* Drawer scrim (mobile only). */}
      {open ? (
        <div
          className="fixed inset-0 z-40 bg-black/40 lg:hidden"
          aria-hidden="true"
          onClick={() => setOpen(false)}
        />
      ) : null}

      {/* The rail — off-canvas drawer on mobile, sticky column on desktop.
          print:hidden so the orders ticket / tables QR sheet print clean. */}
      <aside
        className={cx(
          "fixed inset-y-0 left-0 z-50 flex w-64 flex-col overflow-y-auto bg-sidebar text-sidebar-ink transition-transform print:hidden",
          "lg:sticky lg:top-0 lg:z-auto lg:h-dvh lg:translate-x-0",
          open ? "translate-x-0" : "-translate-x-full lg:translate-x-0",
        )}
      >
        <div className="flex items-center justify-between px-4 py-4">
          <Brand />
          <button
            type="button"
            aria-label="Close navigation"
            onClick={() => setOpen(false)}
            className="flex h-11 w-11 items-center justify-center rounded-control text-sidebar-muted transition hover:bg-forest hover:text-sidebar-ink lg:hidden"
          >
            ✕
          </button>
        </div>

        {/* Venue identity + switcher + plan pill. */}
        <div className="px-3 pb-2">
          <div className="flex items-center justify-between gap-2 rounded-card bg-forest px-3 py-2.5">
            {hasMultiple ? (
              <VenueSwitcher venues={venues} currentId={currentId} />
            ) : (
              <span className="min-w-0 truncate text-sm font-semibold text-sidebar-ink">
                {currentName}
              </span>
            )}
            <span className="shrink-0 rounded-sm bg-accent px-1.5 py-0.5 font-mono text-[10px] font-bold uppercase tracking-wide text-forest">
              {PLAN_LABEL[plan] ?? plan}
            </span>
          </div>
          {hasMultiple ? null : (
            <Link
              href="/onboarding/details"
              onClick={closeDrawer}
              className="mt-1 inline-flex min-h-11 items-center px-3 text-xs font-medium text-sidebar-muted transition hover:text-sidebar-ink"
            >
              ＋ Add location
            </Link>
          )}
        </div>

        <nav className="flex-1 space-y-6 px-3 py-2">
          {groups.map((group) => (
            <div key={group.title}>
              <p className="px-3 pb-2 font-mono text-[10px] font-bold uppercase tracking-wide text-sidebar-muted">
                {group.title}
              </p>
              <ul className="space-y-0.5">
                {group.items.map((item) => {
                  const active = isActive(item);
                  return (
                    <li key={item.label}>
                      <Link
                        href={item.href}
                        onClick={closeDrawer}
                        {...(item.external
                          ? { target: "_blank", rel: "noreferrer" }
                          : {})}
                        aria-current={active ? "page" : undefined}
                        className={cx(
                          "flex min-h-11 items-center gap-3 rounded-control px-3 text-sm font-medium transition",
                          active
                            ? "bg-accent text-forest"
                            : "text-sidebar-ink hover:bg-forest",
                        )}
                      >
                        <span aria-hidden="true" className="shrink-0">
                          {item.icon}
                        </span>
                        <span className="flex-1 truncate">{item.label}</span>
                        {item.badge && item.badge > 0 ? (
                          <span
                            aria-label={`${item.badge} active`}
                            className={cx(
                              "min-w-5 shrink-0 rounded-pill px-1.5 text-center font-mono text-[10px] font-bold leading-5",
                              active
                                ? "bg-forest text-sidebar-ink"
                                : "bg-accent text-forest",
                            )}
                          >
                            {item.badge}
                          </span>
                        ) : null}
                      </Link>
                    </li>
                  );
                })}
              </ul>
            </div>
          ))}
        </nav>

        {/* User footer — identity + sign-out (posts to the server action). */}
        <div className="mt-auto border-t border-forest px-3 py-3">
          <p className="truncate px-3 text-sm font-medium text-sidebar-ink">
            {userName ?? userEmail ?? "Owner"}
          </p>
          <p className="px-3 text-xs text-sidebar-muted">Owner</p>
          <form action={signOutOwner}>
            <button
              type="submit"
              className="mt-1 flex min-h-11 w-full items-center rounded-control px-3 text-sm font-medium text-sidebar-muted transition hover:bg-forest hover:text-sidebar-ink"
            >
              Sign out
            </button>
          </form>
        </div>
      </aside>
    </>
  );
}

function Brand() {
  return (
    <span className="flex items-center gap-2">
      <span
        aria-hidden="true"
        className="flex h-7 w-7 items-center justify-center rounded-control bg-accent font-display text-sm font-bold text-forest"
      >
        P
      </span>
      <span className="font-display text-base font-semibold tracking-tight text-sidebar-ink">
        Prompt2Eat
      </span>
    </span>
  );
}

/* — compact inline nav icons (decorative; rows are labelled) — */
const ICON = "h-5 w-5";
function svg(children: ReactNode) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.8}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={ICON}
    >
      {children}
    </svg>
  );
}
function IconHome() {
  return svg(<path d="M3 11l9-8 9 8M5 10v10h14V10" />);
}
function IconMenu() {
  return svg(<path d="M4 6h16M4 12h16M4 18h10" />);
}
function IconOrders() {
  return svg(
    <>
      <rect x="5" y="3" width="14" height="18" rx="2" />
      <path d="M9 7h6M9 11h6M9 15h4" />
    </>,
  );
}
function IconTables() {
  return svg(
    <>
      <rect x="3" y="4" width="18" height="16" rx="2" />
      <path d="M3 10h18M9 10v10" />
    </>,
  );
}
function IconStorefront() {
  return svg(
    <>
      <path d="M4 9l1-4h14l1 4M5 9v11h14V9M4 9h16" />
    </>,
  );
}
function IconSettings() {
  return svg(
    <>
      <circle cx="12" cy="12" r="3" />
      <path d="M12 2v3M12 19v3M2 12h3M19 12h3M5 5l2 2M17 17l2 2M19 5l-2 2M7 17l-2 2" />
    </>,
  );
}
function IconPayments() {
  return svg(
    <>
      <rect x="2" y="6" width="20" height="12" rx="2" />
      <path d="M2 10h20" />
    </>,
  );
}
function IconBilling() {
  return svg(
    <>
      <path d="M6 3h12v18l-3-2-3 2-3-2-3 2zM9 8h6M9 12h6" />
    </>,
  );
}
function IconHamburger() {
  return svg(<path d="M4 6h16M4 12h16M4 18h16" />);
}
