"use client";

import { useMemo, useState } from "react";

import type { ShopProduct } from "@/lib/shop/feed";

const GRADIENTS = [
  "from-[#e7d3a3] to-[#c9a35e]",
  "from-[#cdb98f] to-[#8a6f3f]",
  "from-[#d9c39a] to-[#a8824c]",
  "from-[#dcc7a0] to-[#b08a3f]",
  "from-[#cbb587] to-[#7f6534]",
];

const eyebrow = "font-mono text-[9px] font-bold uppercase tracking-[0.16em]";

export function ShopGrid({ products }: { products: ShopProduct[] }) {
  const categories = useMemo(
    () => ["All", ...Array.from(new Set(products.map((p) => p.subcategory ?? p.category)))],
    [products],
  );
  const [cat, setCat] = useState("All");
  const visible = cat === "All" ? products : products.filter(
    (p) => (p.subcategory ?? p.category) === cat,
  );

  return (
    <>
      <div className="flex flex-wrap gap-2">
        {categories.map((c) => (
          <button
            key={c}
            type="button"
            onClick={() => setCat(c)}
            className={`rounded-full px-3.5 py-1.5 text-[13px] font-semibold transition ${
              cat === c
                ? "bg-[var(--color-accent)] text-[#16241C]"
                : "border border-[#E0D6C1] bg-[#FFFDF8] text-[#4A5248] hover:bg-[#F6F0E2]"
            }`}
          >
            {c}
          </button>
        ))}
      </div>

      <div className="mt-8 grid gap-[18px] [grid-template-columns:repeat(auto-fill,minmax(230px,1fr))]">
        {visible.map((p, i) => (
          <Card key={p.id} product={p} grad={GRADIENTS[i % GRADIENTS.length]} />
        ))}
      </div>
    </>
  );
}

function Card({ product, grad }: { product: ShopProduct; grad: string }) {
  const inner = (
    <>
      <span className="relative flex aspect-[4/3] items-center justify-center overflow-hidden">
        {product.imageUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={product.imageUrl}
            alt={product.name}
            loading="lazy"
            className="h-full w-full object-cover"
          />
        ) : (
          <span className={`flex h-full w-full items-center justify-center bg-gradient-to-br ${grad}`}>
            <span className={`${eyebrow} text-white/70`}>Product shot</span>
          </span>
        )}
        {product.badge ? (
          <span className="absolute left-2 top-2 rounded-full bg-[var(--color-accent)] px-2 py-0.5 font-mono text-[9px] font-bold uppercase tracking-wider text-[#16241C]">
            {product.badge}
          </span>
        ) : null}
      </span>
      <span className="block p-4">
        <span className={`${eyebrow} text-[#A99A78]`}>
          {product.subcategory ?? product.category}
        </span>
        <span className="mt-1 block font-display text-[15.5px] font-extrabold leading-snug tracking-[-0.015em] text-[#16241C]">
          {product.name}
        </span>
        <span className="mt-2 flex items-center justify-between">
          <span className="font-display text-lg font-extrabold text-[#16241C]">
            {product.price || "See price"}
          </span>
          <span className="rounded-lg bg-[var(--color-accent)] px-3 py-1.5 text-xs font-bold text-[#16241C] transition group-hover:bg-[#EAA62B]">
            {product.link ? "View" : "＋ Add"}
          </span>
        </span>
      </span>
    </>
  );

  const cls =
    "group flex flex-col overflow-hidden rounded-[22px] border border-[#EDE4D2] bg-[#FFFDF8] shadow-[0_1px_3px_rgba(20,30,25,0.04)] transition hover:-translate-y-1 hover:shadow-[0_24px_46px_-24px_rgba(20,30,25,0.3)]";

  return product.link ? (
    <a href={product.link} target="_blank" rel="noopener noreferrer" className={cls}>
      {inner}
    </a>
  ) : (
    <div className={cls}>{inner}</div>
  );
}
