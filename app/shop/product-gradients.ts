/**
 * Placeholder gradients for shop product tiles (audit D5).
 *
 * One array, because there were two — `shop-grid.tsx` and `_landing/shop-teaser.tsx`
 * each declared their own, and they had ALREADY drifted: the grid had five
 * entries, the teaser three. Both index with `i % GRADIENTS.length`, and the
 * teaser renders exactly three products, so it kept using entries 0–2 either
 * way. Sharing the array is therefore visually identical today — and stops the
 * next colour being added to only one of them.
 *
 * Plain data with no imports, so the server teaser and the "use client" grid can
 * both take it. The class strings stay LITERAL here on purpose: Tailwind scans
 * source text, so a computed string would emit no utility at all.
 */
export const PRODUCT_GRADIENTS = [
  "from-[#e7d3a3] to-[#c9a35e]",
  "from-[#cdb98f] to-[#8a6f3f]",
  "from-[#d9c39a] to-[#a8824c]",
  "from-[#dcc7a0] to-[#b08a3f]",
  "from-[#cbb587] to-[#7f6534]",
] as const;
