"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import type { ReactNode } from "react";

import { cx } from "@/app/_components/cx";

import { signOutOwner } from "./actions";
import { setSidebarCollapsed, useSidebarCollapsed } from "./sidebar-preference";
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
        { label: "Studio", href: "/dashboard/studio", icon: <IconStudio /> },
        { label: "Stock", href: "/dashboard/stock", icon: <IconStock /> },
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
        {
          label: "Integrations",
          href: "/dashboard/integrations",
          icon: <IconIntegrations />,
        },
        { label: "Apps", href: "/dashboard/apps", icon: <IconApps /> },
        { label: "Shop", href: "/dashboard/marketplace", icon: <IconShop /> },
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

  const groups = navGroups(currentSlug, activeOrderCount);
  const ownerLabel = userName ?? userEmail ?? "Owner";

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

        <nav className="flex-1 space-y-6 px-3 py-2">
          {groups.map((group, groupIndex) => (
            <div
              key={group.title}
              className={cx(
                // Collapsed hides the group titles, so a hairline keeps the
                // Manage / Business clusters visually separated.
                collapsed &&
                  groupIndex > 0 &&
                  "lg:border-t lg:border-forest lg:pt-4",
              )}
            >
              <p
                className={cx(
                  "px-3 pb-2 font-mono text-[10px] font-bold uppercase tracking-wide text-sidebar-muted",
                  collapsed && "lg:hidden",
                )}
              >
                {group.title}
              </p>
              <ul className="space-y-0.5">
                {group.items.map((item) => {
                  const active = isActive(item);
                  const hasBadge = Boolean(item.badge && item.badge > 0);
                  return (
                    <li key={item.label}>
                      <Link
                        href={item.href}
                        onClick={closeDrawer}
                        {...(item.external
                          ? { target: "_blank", rel: "noreferrer" }
                          : {})}
                        aria-current={active ? "page" : undefined}
                        title={collapsed ? item.label : undefined}
                        className={cx(
                          "flex min-h-11 items-center gap-3 rounded-control px-3 text-sm font-medium transition",
                          active
                            ? "bg-accent text-forest"
                            : "text-sidebar-ink hover:bg-forest",
                          collapsed && "lg:justify-center lg:gap-0 lg:px-0",
                        )}
                      >
                        <span aria-hidden="true" className="relative shrink-0">
                          {item.icon}
                          {/* Collapsed: the numeric pill can't fit at 76px, so an
                              active-order count shows as a dot on the icon. */}
                          {hasBadge ? (
                            <span
                              aria-hidden="true"
                              className={cx(
                                "absolute -right-0.5 -top-0.5 hidden h-2 w-2 rounded-full bg-accent ring-2 ring-sidebar",
                                collapsed && "lg:block",
                              )}
                            />
                          ) : null}
                        </span>
                        <span
                          className={cx("flex-1 truncate", collapsed && "lg:sr-only")}
                        >
                          {item.label}
                        </span>
                        {/* Visible numeric pill (decorative — aria-hidden); the
                            count is conveyed to screen readers by the sr-only
                            span below, so it survives the collapsed dot too. */}
                        {hasBadge ? (
                          <span
                            aria-hidden="true"
                            className={cx(
                              "min-w-5 shrink-0 rounded-pill px-1.5 text-center font-mono text-[10px] font-bold leading-5",
                              active
                                ? "bg-forest text-sidebar-ink"
                                : "bg-accent text-forest",
                              collapsed && "lg:hidden",
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
            </div>
          ))}
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
// 3D box — the design bundle's stock glyph (P2ESidebar).
function IconStock() {
  return svg(
    <>
      <path d="M4 7.6 12 3.6l8 4v8.8l-8 4-8-4z" />
      <path d="M4 7.6l8 4 8-4M12 11.6v8.8" />
    </>,
  );
}

function IconStudio() {
  return svg(
    <>
      <rect x="4" y="4" width="16" height="16" rx="2" />
      <path d="M4 15l4-4 3 3 4-5 5 6" />
      <circle cx="9" cy="9" r="1.4" />
    </>,
  );
}

function IconShop() {
  return svg(
    <>
      <path d="M4 8h16l-1 4H5z" />
      <path d="M5 12v7h14v-7M4 8l1.5-4h13L20 8" />
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
// 2×2 app grid, the fourth cell a circle — the design bundle's apps glyph.
function IconApps() {
  return svg(
    <>
      <rect x="3.2" y="3.2" width="7.2" height="7.2" rx="2" />
      <rect x="13.6" y="3.2" width="7.2" height="7.2" rx="2" />
      <rect x="3.2" y="13.6" width="7.2" height="7.2" rx="2" />
      <circle cx="17.2" cy="17.2" r="3.8" />
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
