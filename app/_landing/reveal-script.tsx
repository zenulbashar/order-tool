"use client";

import { useEffect } from "react";

/**
 * Progressive enhancement for the landing page: reveals `[data-reveal]` elements
 * on scroll (with a per-element `data-delay` stagger) and counts up
 * `[data-count]` figures when they enter view. No-JS shows everything; reduced
 * motion snaps to the final state. Renders nothing.
 */
export function RevealScript() {
  useEffect(() => {
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    const reveals = document.querySelectorAll<HTMLElement>("[data-reveal]");
    let revealObserver: IntersectionObserver | null = null;
    if (reduced) {
      reveals.forEach((el) => el.classList.add("is-visible"));
    } else {
      revealObserver = new IntersectionObserver(
        (entries, obs) => {
          entries.forEach((entry) => {
            if (!entry.isIntersecting) return;
            const el = entry.target as HTMLElement;
            const delay = Number(el.dataset.delay ?? 0);
            window.setTimeout(() => el.classList.add("is-visible"), delay);
            obs.unobserve(el);
          });
        },
        { threshold: 0.12, rootMargin: "0px 0px -7% 0px" },
      );
      reveals.forEach((el) => revealObserver!.observe(el));
    }

    function runCount(el: HTMLElement) {
      const target = Number(el.dataset.count ?? 0);
      const decimals = Number(el.dataset.decimals ?? 0);
      const suffix = el.dataset.suffix ?? "";
      const prefix = el.dataset.prefix ?? "";
      const format = (v: number) => prefix + v.toFixed(decimals) + suffix;
      if (reduced) {
        el.textContent = format(target);
        return;
      }
      const duration = 1400;
      const start = performance.now();
      const tick = (now: number) => {
        const t = Math.min(1, (now - start) / duration);
        const eased = 1 - Math.pow(1 - t, 3);
        el.textContent = format(target * eased);
        if (t < 1) requestAnimationFrame(tick);
      };
      requestAnimationFrame(tick);
    }

    const countObserver = new IntersectionObserver(
      (entries, obs) => {
        entries.forEach((entry) => {
          if (!entry.isIntersecting) return;
          runCount(entry.target as HTMLElement);
          obs.unobserve(entry.target);
        });
      },
      { threshold: 0.6 },
    );
    document
      .querySelectorAll<HTMLElement>("[data-count]")
      .forEach((el) => countObserver.observe(el));

    return () => {
      revealObserver?.disconnect();
      countObserver.disconnect();
    };
  }, []);

  return null;
}
