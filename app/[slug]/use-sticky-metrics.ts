"use client";

import { useEffect, useRef, type RefObject } from "react";

/**
 * Publishes the measured height of a sticky layer as a CSS variable on <html>
 * (UI audit RC-5 / P1-2 / P2-3).
 *
 * Before this, five unrelated magic numbers described one sticky stack and none
 * of them matched it:
 *
 *   storefront.tsx   scroll-mt-[124px]           (124)
 *   storefront.tsx   scroll-mt-32 on sections    (128)
 *   category-nav.tsx rootMargin "-120px"         (120)
 *   cart-rail.tsx    top-[136px]                 (136)
 *   cart-rail.tsx    max-h-[calc(100dvh-156px)]  (156)
 *
 * The real mobile strip — search row + dietary chips + disclaimer + pill nav —
 * is ~150–170px, so every anchor under-shot: tapping a category chip scrolled
 * the heading 25–45px BEHIND the sticky bar, and the scroll-spy flipped the
 * active chip a section early. None of the five accounted for the
 * AnnouncementBar, which is dismissible and so changes the height at runtime.
 *
 * Measuring is what makes the AnnouncementBar participate: a ResizeObserver sees
 * the strip shrink when the bar is dismissed, where an arithmetic constant
 * cannot. The variable is set on documentElement so plain Tailwind arbitrary
 * values in other components can read it without prop-drilling.
 *
 * Every consumer passes a fallback (`var(--p2e-sticky-h, 128px)`), so the layout
 * is still sane for the first paint before the observer fires, and on the server.
 */
export function useStickyMetric<T extends HTMLElement>(
  name: "--p2e-sticky-h" | "--p2e-header-h",
): RefObject<T | null> {
  const ref = useRef<T | null>(null);

  useEffect(() => {
    const el = ref.current;
    const root = document.documentElement;
    if (!el) {
      // The strip is conditional (landing view, empty menu). Clear rather than
      // leave a stale height behind — a value from the previous render would be
      // worse than the fallback.
      root.style.removeProperty(name);
      return;
    }

    const publish = (h: number) =>
      root.style.setProperty(name, `${Math.round(h)}px`);

    publish(el.getBoundingClientRect().height);

    const observer = new ResizeObserver(([entry]) => {
      if (entry) publish(entry.contentRect.height);
    });
    observer.observe(el);

    return () => {
      observer.disconnect();
      root.style.removeProperty(name);
    };
  }, [name]);

  return ref;
}

/**
 * Reads a published metric back as a number, for the one consumer that needs it
 * in JS rather than CSS (`category-nav`'s IntersectionObserver rootMargin).
 */
export function readStickyMetric(
  name: "--p2e-sticky-h" | "--p2e-header-h",
  fallback: number,
): number {
  if (typeof document === "undefined") return fallback;
  const raw = getComputedStyle(document.documentElement).getPropertyValue(name);
  const parsed = Number.parseInt(raw, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}
