"use client";

/**
 * "Browse the menu" — visual category tiles (the bakery-site pattern: big photo
 * cards with the category name overlaid). Each tile uses the category's first
 * available item photo; a category with no photos falls back to a brand-tinted
 * monogram, so a mixed set never looks broken. Clicking a tile smooth-scrolls to
 * that category's section. Desktop-only and purely navigational — the sticky tab
 * strip + full menu below are unchanged.
 */
export type CategoryTile = {
  id: string;
  name: string;
  image: string | null;
};

export function CategoryTiles({
  categories,
  onJump,
}: {
  categories: CategoryTile[];
  onJump: (id: string) => void;
}) {
  if (categories.length < 2) return null;

  return (
    <section className="mb-8" aria-label="Browse the menu">
      <h2 className="mb-3 font-display text-xl font-semibold tracking-tight text-ink">
        Browse the menu
      </h2>
      <ul className="grid grid-cols-2 gap-3 xl:grid-cols-3">
        {categories.map((category) => (
          <li key={category.id}>
            <button
              type="button"
              onClick={() => onJump(category.id)}
              className="group relative block aspect-[16/9] w-full overflow-hidden rounded-card border border-sand shadow-card transition hover:shadow-lift"
            >
              {category.image ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={category.image}
                  alt=""
                  loading="lazy"
                  decoding="async"
                  className="absolute inset-0 h-full w-full object-cover transition duration-300 group-hover:scale-105"
                />
              ) : (
                <span
                  aria-hidden="true"
                  className="absolute inset-0 flex items-center justify-center font-display text-4xl font-extrabold"
                  style={{
                    background:
                      "color-mix(in srgb, var(--brand) 12%, var(--color-surface))",
                    color: "color-mix(in srgb, var(--brand) 45%, transparent)",
                  }}
                >
                  {category.name.charAt(0).toUpperCase()}
                </span>
              )}
              <span className="absolute inset-0 bg-gradient-to-t from-black/55 via-black/10 to-transparent" />
              <span className="absolute inset-x-0 bottom-0 p-3 text-left font-display text-lg font-semibold tracking-tight text-white">
                {category.name}
              </span>
            </button>
          </li>
        ))}
      </ul>
    </section>
  );
}
