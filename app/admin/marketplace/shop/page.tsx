import type { Metadata } from "next";
import Link from "next/link";

import { requirePlatformAdmin } from "@/lib/platform-admin";
import { getShopConfig, isCategoryVisible } from "@/lib/shop/config";
import { getAllFeedProducts } from "@/lib/shop/feed";

import { saveShopCategories, saveShopMarkup, setShopProductOverride } from "./actions";

export const dynamic = "force-dynamic";

export const metadata: Metadata = { title: "Shop admin" };

const eyebrow = "font-mono text-[9px] font-bold uppercase tracking-wider text-label";
const PRODUCT_LIMIT = 60;

export default async function AdminShopPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string }>;
}) {
  await requirePlatformAdmin();

  const q = ((await searchParams).q ?? "").trim();
  const [all, cfg] = await Promise.all([getAllFeedProducts(), getShopConfig()]);

  // Leaf categories with counts + effective visibility.
  const counts = new Map<string, number>();
  for (const p of all) {
    const leaf = p.subcategory ?? p.category;
    if (leaf.trim()) counts.set(leaf, (counts.get(leaf) ?? 0) + 1);
  }
  const categories = [...counts.entries()]
    .map(([name, count]) => ({ name, count, visible: isCategoryVisible(name, cfg) }))
    .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name));
  const visibleCategoryCount = categories.filter((c) => c.visible).length;

  // Product search (by name / code / category).
  const ql = q.toLowerCase();
  const matches = q
    ? all
        .filter((p) =>
          `${p.name} ${p.id} ${p.category} ${p.subcategory ?? ""}`.toLowerCase().includes(ql),
        )
        .slice(0, PRODUCT_LIMIT)
    : [];

  const feedDown = all.length === 0;

  return (
    <main className="mx-auto max-w-5xl px-5 py-8">
      <header className="mb-6">
        <Link
          href="/admin/marketplace"
          className="text-xs font-medium text-[var(--action)] hover:opacity-80"
        >
          ← Marketplace
        </Link>
        <h1 className="mt-1 font-display text-2xl font-extrabold tracking-tight text-ink">
          Shop page controls
        </h1>
        <p className="mt-1 text-sm text-muted">
          Tune the public <span className="font-semibold">/shop</span> grid (live product feed).{" "}
          {feedDown
            ? "Feed unavailable right now."
            : `${all.length} products across ${categories.length} categories · ${visibleCategoryCount} categories showing.`}
        </p>
      </header>

      {feedDown ? (
        <div className="rounded-card border border-dashed border-line p-6 text-center text-sm text-muted">
          The product feed is unreachable, so there is nothing to configure. Set{" "}
          <code>SHOP_FEED_URL</code> and try again.
        </div>
      ) : (
        <>
          {/* Global markup */}
          <section className="mb-8">
            <p className={`${eyebrow} mb-2`}>Global markup</p>
            <form
              action={saveShopMarkup}
              className="flex flex-wrap items-center gap-3 rounded-card border border-line bg-surface-elevated p-4 shadow-sm"
            >
              <label className="text-sm text-ink">
                Add
                <input
                  type="number"
                  name="markupPct"
                  step="0.1"
                  min="0"
                  defaultValue={(cfg.markupBps / 100).toString()}
                  className="mx-2 w-24 rounded-control border border-line-strong px-2 py-1 text-sm text-ink"
                />
                % on top of every feed price
              </label>
              <button
                type="submit"
                className="rounded-control bg-[var(--action)] px-3 py-1.5 text-xs font-bold text-white transition hover:opacity-90"
              >
                Save markup
              </button>
              <span className="text-xs text-muted">
                Per-product price overrides win over this.
              </span>
            </form>
          </section>

          {/* Category visibility */}
          <section className="mb-8">
            <p className={`${eyebrow} mb-2`}>Categories shown on /shop</p>
            <form action={saveShopCategories}>
              <div className="max-h-[360px] overflow-y-auto rounded-card border border-line bg-surface-elevated shadow-sm">
                <ul className="divide-y divide-line/60">
                  {categories.map((c) => (
                    <li key={c.name}>
                      <label className="flex cursor-pointer items-center justify-between gap-3 px-4 py-2 hover:bg-hover-secondary">
                        <span className="flex min-w-0 items-center gap-2">
                          <input
                            type="checkbox"
                            name="visible"
                            value={c.name}
                            defaultChecked={c.visible}
                            className="h-4 w-4 shrink-0 accent-[var(--action)]"
                          />
                          <span className="truncate text-sm text-ink">{c.name}</span>
                        </span>
                        <span className="shrink-0 font-mono text-[10px] text-muted">
                          {c.count}
                        </span>
                      </label>
                    </li>
                  ))}
                </ul>
              </div>
              <div className="mt-3 flex items-center gap-3">
                <button
                  type="submit"
                  className="rounded-control bg-[var(--action)] px-3 py-1.5 text-xs font-bold text-white transition hover:opacity-90"
                >
                  Save visibility
                </button>
                <span className="text-xs text-muted">
                  Unchecked categories are hidden from the shop and homepage picks.
                </span>
              </div>
            </form>
          </section>

          {/* Per-product overrides */}
          <section>
            <p className={`${eyebrow} mb-2`}>Products — hide or reprice</p>
            <form method="get" className="mb-3 flex gap-2">
              <input
                type="search"
                name="q"
                defaultValue={q}
                placeholder="Search by name, code, or category…"
                className="w-full max-w-md rounded-control border border-line-strong px-3 py-1.5 text-sm text-ink"
              />
              <button
                type="submit"
                className="rounded-control border border-line-strong px-3 py-1.5 text-xs font-bold text-ink transition hover:bg-hover-secondary"
              >
                Search
              </button>
            </form>

            {q === "" ? (
              <p className="text-sm text-muted">
                Search for a product to hide it or set a custom price.
              </p>
            ) : matches.length === 0 ? (
              <p className="text-sm text-muted">No products match “{q}”.</p>
            ) : (
              <div className="overflow-hidden rounded-card border border-line bg-surface-elevated shadow-card">
                <ul className="divide-y divide-line/60">
                  {matches.map((p) => {
                    const ovr = cfg.overrides.get(p.id);
                    return (
                      <li key={p.id} className="px-4 py-3">
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <span className="flex min-w-0 items-center gap-2">
                            <span className="truncate text-sm font-bold text-ink">{p.name}</span>
                            <span className="rounded-[5px] bg-sand px-1.5 py-0.5 font-mono text-[8px] font-bold uppercase tracking-wider text-muted">
                              {p.subcategory ?? p.category}
                            </span>
                            {ovr?.hidden ? (
                              <span className="rounded-[5px] bg-[var(--color-warm)]/15 px-1.5 py-0.5 font-mono text-[8px] font-bold uppercase tracking-wider text-warm-deep">
                                Hidden
                              </span>
                            ) : null}
                          </span>
                          <span className="font-mono text-[10px] text-muted">
                            {p.id} · feed {p.price || "—"} · {p.inStock ? "in stock" : "out of stock"}
                          </span>
                        </div>
                        <form
                          action={setShopProductOverride}
                          className="mt-2 flex flex-wrap items-center gap-3"
                        >
                          <input type="hidden" name="mmtCode" value={p.id} />
                          <label className="flex items-center gap-1.5 text-xs text-ink">
                            <input
                              type="checkbox"
                              name="hidden"
                              defaultChecked={ovr?.hidden ?? false}
                              className="h-4 w-4 accent-[var(--action)]"
                            />
                            Hide
                          </label>
                          <label className="flex items-center gap-1.5 text-xs text-ink">
                            Price $
                            <input
                              type="number"
                              name="priceOverride"
                              step="0.01"
                              min="0"
                              defaultValue={
                                ovr?.priceOverrideCents != null
                                  ? (ovr.priceOverrideCents / 100).toFixed(2)
                                  : ""
                              }
                              placeholder="feed"
                              className="w-24 rounded-control border border-line-strong px-2 py-1 text-xs text-ink"
                            />
                          </label>
                          <button
                            type="submit"
                            className="rounded-control bg-[var(--action)] px-3 py-1 text-xs font-bold text-white transition hover:opacity-90"
                          >
                            Save
                          </button>
                        </form>
                      </li>
                    );
                  })}
                </ul>
                {matches.length === PRODUCT_LIMIT ? (
                  <p className="border-t border-line/60 px-4 py-2 text-xs text-muted">
                    Showing the first {PRODUCT_LIMIT} matches — refine your search to narrow.
                  </p>
                ) : null}
              </div>
            )}
          </section>
        </>
      )}
    </main>
  );
}
