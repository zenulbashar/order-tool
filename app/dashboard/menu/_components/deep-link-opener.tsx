"use client";

import { useEffect } from "react";

/* -------------------------------------------------------------------------- */
/*  Deep-link opener — progressive enhancement only.                           */
/*                                                                            */
/*  The menu editor nests items inside collapsed <details>. When the health    */
/*  panel links to "#item-<id>", this opens every ancestor <details> of the    */
/*  target and scrolls it into view so the owner lands right on the row to     */
/*  fix. It renders nothing and changes no data; with JS off, the link still   */
/*  navigates to the anchor (modern browsers auto-expand <details> for         */
/*  fragment navigation), so the feature degrades gracefully.                  */
/* -------------------------------------------------------------------------- */
export function DeepLinkOpener() {
  useEffect(() => {
    function reveal() {
      const hash = window.location.hash;
      if (hash.length < 2) return;
      const target = document.getElementById(decodeURIComponent(hash.slice(1)));
      if (!target) return;
      for (
        let el: HTMLElement | null = target;
        el;
        el = el.parentElement
      ) {
        if (el instanceof HTMLDetailsElement) el.open = true;
      }
      target.scrollIntoView({ behavior: "smooth", block: "center" });
    }
    reveal();
    window.addEventListener("hashchange", reveal);
    return () => window.removeEventListener("hashchange", reveal);
  }, []);

  return null;
}
