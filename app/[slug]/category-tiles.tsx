import Link from "next/link";

/**
 * The categories landing grid: big photo tiles (the bakery-site pattern — Bread ·
 * Pies & Quiches · Sandwiches). Each tile uses that category's first item photo,
 * with a brand-tinted monogram fallback when a category has no photos. Tapping a
 * tile navigates to the menu page anchored at that category (`/menu#id`). The
 * caller limits how many are shown. Plain component (Link-based nav, no client
 * state) so it renders inside the client storefront.
 */
export type CategoryTile = {
  id: string;
  name: string;
  image: string | null;
};

export function CategoryTiles({
  slug,
  categories,
}: {
  slug: string;
  categories: CategoryTile[];
}) {
  if (categories.length === 0) return null;

  return (
    <ul className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
      {categories.map((category) => (
        <li key={category.id}>
          <Link
            href={`/${slug}/menu#${category.id}`}
            className="group relative block aspect-[4/3] w-full overflow-hidden rounded-card border border-sand shadow-card transition hover:shadow-lift"
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
                className="absolute inset-0 flex items-center justify-center font-display text-6xl font-extrabold"
                style={{
                  background:
                    "color-mix(in srgb, var(--brand) 12%, var(--color-surface))",
                  color: "color-mix(in srgb, var(--brand) 45%, transparent)",
                }}
              >
                {category.name.charAt(0).toUpperCase()}
              </span>
            )}
            <span className="absolute inset-0 bg-gradient-to-t from-black/60 via-black/10 to-transparent" />
            <span className="absolute inset-x-0 bottom-0 p-4 text-left font-display text-2xl font-bold tracking-tight text-white">
              {category.name}
            </span>
          </Link>
        </li>
      ))}
    </ul>
  );
}
