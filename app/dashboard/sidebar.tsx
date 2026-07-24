"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import type { ReactNode } from "react";

import { cx } from "@/app/_components/cx";
import { BrandMark, Wordmark } from "@/app/_components/wordmark";

import { signOutOwner } from "./actions";
import { setSidebarCollapsed, useSidebarCollapsed } from "./sidebar-preference";
import { VenueSwitcher } from "./venue-switcher";

type NavLeaf = {
  label: string;
  href: string;
  /** Exact-match only, else section-prefix match. */
  exact?: boolean;
  /** External link (View storefront) — opens a new tab, never "active". */
  external?: boolean;
  /** Optional live count pill (e.g. active orders); hidden when 0. */
  badge?: number;
};

/** A standalone top-level link (no children). */
type NavLink = { kind: "link"; icon: ReactNode } & NavLeaf;
/** A collapsible top-level category with child links. */
type NavGroup = {
  kind: "group";
  key: string;
  label: string;
  icon: ReactNode;
  items: NavLeaf[];
};
type NavEntry = NavLink | NavGroup;

/**
 * Two-level navigation: a few standalone links plus collapsible categories, each
 * grouping the pages that belong together in plain-language terms. Categories are
 * collapsed by default; the one containing the current page opens automatically,
 * and the owner's expand/collapse choices are remembered per device. The 76px
 * rail-collapse still works — there, each category shows a single icon linking to
 * its first page.
 */
function navEntries(slug: string, activeOrderCount: number): NavEntry[] {
  return [
    { kind: "link", label: "Home", href: "/dashboard", icon: <IconHome />, exact: true },
    {
      kind: "group",
      key: "menu",
      label: "Menu & photos",
      icon: <IconMenu />,
      items: [
        { label: "Menu", href: "/dashboard/menu", exact: true },
        { label: "Import menu", href: "/dashboard/menu/import" },
        { label: "Write descriptions", href: "/dashboard/menu/descriptions" },
        { label: "Photo library", href: "/dashboard/media" },
        { label: "Design studio", href: "/dashboard/studio" },
      ],
    },
    {
      kind: "group",
      key: "orders",
      label: "Orders & customers",
      icon: <IconOrders />,
      items: [
        { label: "Live orders", href: "/dashboard/orders", badge: activeOrderCount },
        { label: "Tables & QR codes", href: "/dashboard/tables" },
        { label: "Sales reports", href: "/dashboard/reports" },
        { label: "Customers", href: "/dashboard/customers" },
      ],
    },
    {
      kind: "group",
      key: "stock",
      label: "Stock & supplies",
      icon: <IconStock />,
      items: [
        { label: "Ingredients", href: "/dashboard/stock", exact: true },
        { label: "Stock overview", href: "/dashboard/stock/overview" },
        { label: "Reorder suggestions", href: "/dashboard/stock/suggestions" },
        { label: "Scan invoice", href: "/dashboard/stock/scan" },
        { label: "Shop supplies", href: "/dashboard/marketplace" },
      ],
    },
    {
      kind: "group",
      key: "storefront",
      label: "Storefront setup",
      icon: <IconSettings />,
      items: [
        { label: "Brand & colours", href: "/dashboard/settings/brand" },
        { label: "Logo", href: "/dashboard/settings/logo" },
        { label: "Photos & hero", href: "/dashboard/settings/imagery" },
        { label: "Announcement bar", href: "/dashboard/settings/announcement" },
        { label: "Social links", href: "/dashboard/settings/social" },
        { label: "About & description", href: "/dashboard/settings/about" },
        { label: "FAQs", href: "/dashboard/settings/faqs" },
        { label: "SEO & AEO", href: "/dashboard/seo" },
        { label: "Opening hours & location", href: "/dashboard/settings/hours" },
        { label: "Tax (GST)", href: "/dashboard/settings/tax" },
        { label: "Prep stations", href: "/dashboard/settings/stations" },
        { label: "Order notifications", href: "/dashboard/settings/notifications" },
      ],
    },
    {
      kind: "group",
      key: "money",
      label: "Payments & billing",
      icon: <IconPayments />,
      items: [
        { label: "Payments & payouts", href: "/dashboard/payments" },
        { label: "Discount codes", href: "/dashboard/discounts" },
        { label: "Gift cards", href: "/dashboard/gift-cards" },
        { label: "Plan & billing", href: "/dashboard/billing" },
      ],
    },
    {
      kind: "group",
      key: "connections",
      label: "Connections",
      icon: <IconIntegrations />,
      items: [
        { label: "Integrations", href: "/dashboard/integrations" },
        { label: "Apps", href: "/dashboard/apps" },
      ],
    },
    {
      kind: "link",
      label: "View storefront",
      href: `/${slug}`,
      icon: <IconStorefront />,
      external: true,
    },
  ];
}

const GROUPS_KEY = "p2e:sidebar:groups";

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
  brandColor,
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
  brandColor: string;
}) {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  // Desktop-only collapse preference (per-device, localStorage). Drives ONLY
  // lg:-prefixed classes below; the mobile drawer (`open`) ignores it entirely.
  const collapsed = useSidebarCollapsed();

  // Per-device record of the owner's explicit expand/collapse choices per
  // category. Undefined for a category => fall back to the default (open only
  // when it contains the current page). Read from localStorage after mount to
  // stay SSR-safe (same tradeoff as the rail collapse).
  const [explicitOpen, setExplicitOpen] = useState<Record<string, boolean>>({});
  useEffect(() => {
    try {
      const raw = window.localStorage.getItem(GROUPS_KEY);
      if (raw) {
        // eslint-disable-next-line react-hooks/set-state-in-effect
        setExplicitOpen(JSON.parse(raw) as Record<string, boolean>);
      }
    } catch {
      // Private mode / bad JSON — categories just use their defaults.
    }
  }, []);

  // Closing the drawer is driven by the nav links' onClick (close-on-navigate),
  // not a route-watching effect — keeps state changes out of effects.
  const closeDrawer = () => setOpen(false);

  // ⌘\ (Mac) / Ctrl+\ (Win/Linux) toggles the desktop rail. preventDefault since
  // we own the chord; state is set inside the handler, not the effect body.
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key === "\\") {
        event.preventDefault();
        setSidebarCollapsed(!collapsed);
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [collapsed]);

  const entries = navEntries(currentSlug, activeOrderCount);
  const ownerLabel = userName ?? userEmail ?? "Owner";

  function leafActive(item: NavLeaf): boolean {
    if (item.external) return false;
    return item.exact
      ? pathname === item.href
      : pathname === item.href || pathname.startsWith(`${item.href}/`);
  }
  function groupActive(group: NavGroup): boolean {
    return group.items.some(leafActive);
  }
  function groupOpen(group: NavGroup): boolean {
    return explicitOpen[group.key] ?? groupActive(group);
  }
  function toggleGroup(group: NavGroup) {
    setExplicitOpen((prev) => {
      const next = { ...prev, [group.key]: !groupOpen(group) };
      try {
        window.localStorage.setItem(GROUPS_KEY, JSON.stringify(next));
      } catch {
        // Non-fatal — the toggle just won't persist.
      }
      return next;
    });
  }

  const linkRow = (
    active: boolean,
    extra?: string,
  ): string =>
    cx(
      "flex min-h-11 items-center gap-3 rounded-control px-3 text-sm font-medium transition",
      active ? "bg-accent text-forest" : "text-sidebar-ink hover:bg-forest",
      extra,
    );

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
          "fixed inset-y-0 left-0 z-50 flex w-64 flex-col overflow-y-auto bg-sidebar text-sidebar-ink transition-[transform,width] motion-reduce:transition-none print:hidden",
          "lg:sticky lg:top-0 lg:z-auto lg:h-dvh lg:translate-x-0",
          open ? "translate-x-0" : "-translate-x-full lg:translate-x-0",
          collapsed && "lg:w-[76px]",
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
          <div
            className={cx(
              "flex items-center justify-between gap-2 rounded-card bg-forest px-3 py-2.5",
              collapsed && "lg:justify-center",
            )}
          >
            <span className="flex min-w-0 items-center gap-2">
              {/* Decorative venue accent swatch (venue.brandColor); the ring
                  keeps a dark brand colour legible on the forest rail. Collapsed,
                  it's the only identity element left, so it carries the name as a
                  title tooltip (switching requires expanding first). */}
              <span
                aria-hidden="true"
                title={currentName}
                style={{ backgroundColor: brandColor }}
                className="h-4 w-4 shrink-0 rounded-full ring-1 ring-white/15"
              />
              <span
                className={cx("flex min-w-0 items-center", collapsed && "lg:hidden")}
              >
                {hasMultiple ? (
                  <VenueSwitcher venues={venues} currentId={currentId} />
                ) : (
                  <span className="min-w-0 truncate text-sm font-semibold text-sidebar-ink">
                    {currentName}
                  </span>
                )}
              </span>
            </span>
            <span
              className={cx(
                "shrink-0 rounded-sm bg-accent px-1.5 py-0.5 font-mono text-[10px] font-bold uppercase tracking-wide text-forest",
                collapsed && "lg:hidden",
              )}
            >
              {PLAN_LABEL[plan] ?? plan}
            </span>
          </div>
          {hasMultiple ? null : (
            <Link
              href="/onboarding/details"
              onClick={closeDrawer}
              className={cx(
                "mt-1 inline-flex min-h-11 items-center px-3 text-xs font-medium text-sidebar-muted transition hover:text-sidebar-ink",
                collapsed && "lg:hidden",
              )}
            >
              ＋ Add location
            </Link>
          )}
        </div>

        <nav className="flex-1 space-y-1 px-3 py-2">
          {entries.map((entry) => {
            /* --- Standalone link --- */
            if (entry.kind === "link") {
              const active = leafActive(entry);
              return (
                <Link
                  key={entry.label}
                  href={entry.href}
                  onClick={closeDrawer}
                  {...(entry.external
                    ? { target: "_blank", rel: "noreferrer" }
                    : {})}
                  aria-current={active ? "page" : undefined}
                  title={collapsed ? entry.label : undefined}
                  className={linkRow(
                    active,
                    collapsed ? "lg:justify-center lg:gap-0 lg:px-0" : undefined,
                  )}
                >
                  <span aria-hidden="true" className="shrink-0">
                    {entry.icon}
                  </span>
                  <span className={cx("flex-1 truncate", collapsed && "lg:sr-only")}>
                    {entry.label}
                  </span>
                </Link>
              );
            }

            /* --- Category with collapsible children. The 76px collapsed rail
                   and the expanded rail are toggled by CSS only (never a JS
                   branch on `collapsed`), so the mobile drawer always shows the
                   full expandable groups no matter the desktop preference. --- */
            const containsActive = groupActive(entry);
            const groupBadge = entry.items.reduce(
              (sum, item) => sum + (item.badge && item.badge > 0 ? item.badge : 0),
              0,
            );
            const first = entry.items[0];
            const isOpen = groupOpen(entry);
            const sublistId = `nav-${entry.key}`;
            return (
              <div key={entry.key}>
                {/* Collapsed rail: a single icon → the category's first page.
                    Only rendered on desktop, only when the rail is collapsed. */}
                <Link
                  href={first.href}
                  onClick={closeDrawer}
                  title={entry.label}
                  aria-current={containsActive ? "page" : undefined}
                  className={cx(
                    "hidden min-h-11 items-center justify-center rounded-control transition",
                    collapsed ? "lg:flex" : "",
                    containsActive
                      ? "bg-accent text-forest"
                      : "text-sidebar-ink hover:bg-forest",
                  )}
                >
                  <span aria-hidden="true" className="relative shrink-0">
                    {entry.icon}
                    {groupBadge > 0 ? (
                      <span
                        aria-hidden="true"
                        className="absolute -right-0.5 -top-0.5 h-2 w-2 rounded-full bg-accent ring-2 ring-sidebar"
                      />
                    ) : null}
                  </span>
                  <span className="sr-only">{entry.label}</span>
                </Link>

                {/* Expanded: category header toggle + child links. Shown on
                    mobile always; on desktop only when the rail is expanded. */}
                <div className={cx(collapsed && "lg:hidden")}>
                  <button
                    type="button"
                    onClick={() => toggleGroup(entry)}
                    aria-expanded={isOpen}
                    aria-controls={sublistId}
                    className="flex min-h-11 w-full items-center gap-3 rounded-control px-3 text-sm font-medium text-sidebar-ink transition hover:bg-forest"
                  >
                    <span aria-hidden="true" className="shrink-0">
                      {entry.icon}
                    </span>
                    <span
                      className={cx(
                        "flex-1 truncate text-left",
                        containsActive && "font-semibold",
                      )}
                    >
                      {entry.label}
                    </span>
                    {/* Pending count on a closed category so nothing hides. */}
                    {!isOpen && groupBadge > 0 ? (
                      <span
                        aria-hidden="true"
                        className="min-w-5 shrink-0 rounded-pill bg-accent px-1.5 text-center font-mono text-[10px] font-bold leading-5 text-forest"
                      >
                        {groupBadge}
                      </span>
                    ) : null}
                    <span
                      aria-hidden="true"
                      className={cx(
                        "shrink-0 text-sidebar-muted transition-transform",
                        isOpen && "rotate-180",
                      )}
                    >
                      <IconChevron />
                    </span>
                  </button>
                  {isOpen ? (
                    <ul
                      id={sublistId}
                      className="ml-[22px] mt-0.5 space-y-0.5 border-l border-forest pl-3"
                    >
                      {entry.items.map((item) => {
                        const active = leafActive(item);
                        const hasBadge = Boolean(item.badge && item.badge > 0);
                        return (
                          <li key={item.href}>
                            <Link
                              href={item.href}
                              onClick={closeDrawer}
                              aria-current={active ? "page" : undefined}
                              className={cx(
                                "flex min-h-9 items-center gap-2 rounded-control px-3 py-1.5 text-[13px] transition",
                                active
                                  ? "bg-accent font-semibold text-forest"
                                  : "text-sidebar-muted hover:bg-forest hover:text-sidebar-ink",
                              )}
                            >
                              <span className="flex-1 truncate">{item.label}</span>
                              {hasBadge ? (
                                <span
                                  aria-hidden="true"
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
                              {hasBadge ? (
                                <span className="sr-only">{` — ${item.badge} active`}</span>
                              ) : null}
                            </Link>
                          </li>
                        );
                      })}
                    </ul>
                  ) : null}
                </div>
              </div>
            );
          })}
        </nav>

        {/* Desktop-only collapse toggle, just above the footer. The mobile
            drawer has its own ✕ close, so this is hidden below lg. */}
        <button
          type="button"
          onClick={() => setSidebarCollapsed(!collapsed)}
          aria-expanded={!collapsed}
          aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
          title={collapsed ? "Expand sidebar (⌘\\)" : "Collapse sidebar (⌘\\)"}
          className={cx(
            "mx-3 mb-1 hidden min-h-11 items-center rounded-control px-3 text-sm font-medium text-sidebar-muted transition hover:bg-forest hover:text-sidebar-ink lg:flex",
            collapsed && "lg:justify-center lg:px-0",
          )}
        >
          <span aria-hidden="true" className="shrink-0">
            {collapsed ? "»" : "«"}
          </span>
          <span className={cx("ml-3", collapsed && "lg:hidden")}>Collapse</span>
        </button>

        {/* User footer — identity + sign-out (posts to the server action). */}
        <div className="mt-auto border-t border-forest px-3 py-3">
          {/* Collapsed: an avatar initial stands in for the name/role text. */}
          <div
            aria-hidden="true"
            title={ownerLabel}
            className={cx(
              "mx-auto mb-1 hidden h-8 w-8 items-center justify-center rounded-full bg-forest text-sm font-semibold text-sidebar-ink",
              collapsed && "lg:flex",
            )}
          >
            {ownerLabel.trim().charAt(0).toUpperCase()}
          </div>
          <p
            className={cx(
              "truncate px-3 text-sm font-medium text-sidebar-ink",
              collapsed && "lg:hidden",
            )}
          >
            {ownerLabel}
          </p>
          <p
            className={cx(
              "px-3 text-xs text-sidebar-muted",
              collapsed && "lg:hidden",
            )}
          >
            Owner
          </p>
          <form action={signOutOwner}>
            <button
              type="submit"
              aria-label="Sign out"
              title="Sign out"
              className={cx(
                "mt-1 flex min-h-11 w-full items-center rounded-control px-3 text-sm font-medium text-sidebar-muted transition hover:bg-forest hover:text-sidebar-ink",
                collapsed && "lg:justify-center lg:px-0",
              )}
            >
              <span
                aria-hidden="true"
                className={cx("hidden shrink-0", collapsed && "lg:block")}
              >
                <IconSignOut />
              </span>
              <span className={cx(collapsed && "lg:hidden")}>Sign out</span>
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
      <BrandMark className="h-7 w-7 shrink-0" />
      <Wordmark className="text-base text-sidebar-ink" />
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
function IconChevron() {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      className="h-4 w-4"
    >
      <path d="M6 9l6 6 6-6" />
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
// 3D box — the design bundle's stock glyph (P2ESidebar).
function IconStock() {
  return svg(
    <>
      <path d="M4 7.6 12 3.6l8 4v8.8l-8 4-8-4z" />
      <path d="M4 7.6l8 4 8-4M12 11.6v8.8" />
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
// Two linked nodes — the design bundle's integrations glyph (P2ESidebar).
function IconIntegrations() {
  return svg(
    <>
      <circle cx="6.4" cy="17.6" r="3" />
      <circle cx="17.6" cy="6.4" r="3" />
      <path d="M8.8 15.2 15.2 8.8" />
    </>,
  );
}
function IconHamburger() {
  return svg(<path d="M4 6h16M4 12h16M4 18h16" />);
}
function IconSignOut() {
  return svg(
    <>
      <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
      <path d="M16 17l5-5-5-5M21 12H9" />
    </>,
  );
}
