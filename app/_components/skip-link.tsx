"use client";

/**
 * Skip-to-content link — WCAG 2.2 2.4.1 (Bypass Blocks). Mounted as the first
 * child of <body> in the root layout so it is the first Tab stop on every
 * page; visually hidden until keyboard-focused.
 *
 * Works two ways so it functions on every surface without threading an id
 * through all page shells:
 *  - no-JS: a plain anchor to #main-content, present on the shared shells
 *    (dashboard, marketing, onboarding, account);
 *  - JS: falls back to the page's first <main>, else its first <h1>, and moves
 *    REAL keyboard focus (tabindex=-1) rather than only scrolling — otherwise
 *    the next Tab would start from the top again, defeating the bypass.
 */
export function SkipLink() {
  return (
    <a
      href="#main-content"
      onClick={(event) => {
        const target =
          document.getElementById("main-content") ??
          document.querySelector("main") ??
          document.querySelector("h1");
        if (!(target instanceof HTMLElement)) return; // bare anchor still tries
        event.preventDefault();
        if (!target.hasAttribute("tabindex")) {
          target.setAttribute("tabindex", "-1");
        }
        target.focus();
        target.scrollIntoView({ block: "start" });
      }}
      className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-[100] focus:rounded-control focus:bg-ink focus:px-4 focus:py-2.5 focus:text-sm focus:font-semibold focus:text-surface focus:shadow-lift"
    >
      Skip to content
    </a>
  );
}
