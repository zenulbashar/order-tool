"use client";

import { useEffect, useRef } from "react";

/**
 * Modal-dialog behaviour hook (WCAG 2.1.2 / 2.4.3 / ARIA APG dialog pattern).
 *
 * The app has no single <Dialog> shell — each surface (item sheet, cart review,
 * concierge panel, ticket drawer, …) renders its own `fixed inset-0` backdrop
 * with a bespoke panel layout (bottom sheet / right drawer / centred). This hook
 * gives every one of them the keyboard contract that `role="dialog"
 * aria-modal="true"` PROMISES but markup alone cannot deliver, without forcing a
 * shared visual shell:
 *
 *   • move focus into the panel on open (first focusable, else the panel itself);
 *   • trap Tab / Shift+Tab within the panel so focus can't reach the inert,
 *     scrim-obscured page behind it;
 *   • close on Escape;
 *   • restore focus to the trigger on close;
 *   • lock background scroll while open.
 *
 * Usage — attach the returned ref to the PANEL element (the inner box, not the
 * backdrop) and keep the backdrop's click-to-close handler:
 *
 *   const panelRef = useDialog<HTMLDivElement>(onClose);
 *   <div className="fixed inset-0 …" role="dialog" aria-modal aria-label={…}
 *        onClick={onClose}>
 *     <div ref={panelRef} onClick={(e) => e.stopPropagation()}>…</div>
 *   </div>
 *
 * The listener is scoped to the panel (not document), so nested dialogs behave:
 * Escape/Tab act on the innermost open panel only.
 *
 * `active` controls when the behaviour engages. Omit it (defaults to true) for
 * dialogs mounted conditionally by their PARENT — the component only exists while
 * open, so "active" is implicit. Pass the open-state boolean for dialogs that
 * manage their own visibility and stay mounted (e.g. a panel toggled by an
 * internal `open` flag): the focus trap engages/releases as it flips.
 */

const FOCUSABLE_SELECTOR = [
  "a[href]",
  "button:not([disabled])",
  "textarea:not([disabled])",
  "input:not([disabled])",
  "select:not([disabled])",
  '[tabindex]:not([tabindex="-1"])',
].join(",");

function focusableWithin(panel: HTMLElement): HTMLElement[] {
  return Array.from(
    panel.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR),
    // offsetParent is null for display:none (or hidden) subtrees — skip those so
    // focus never lands on an invisible control.
  ).filter((el) => el.offsetParent !== null || el === document.activeElement);
}

export function useDialog<T extends HTMLElement>(
  onClose: () => void,
  active = true,
) {
  const panelRef = useRef<T>(null);
  // Keep the latest onClose without re-running the open/close effect (which must
  // fire exactly once per activation to capture + restore focus correctly).
  // Updated in an effect (not during render) so a re-render can't tear the ref.
  const onCloseRef = useRef(onClose);
  useEffect(() => {
    onCloseRef.current = onClose;
  });

  useEffect(() => {
    if (!active) return;
    const panel = panelRef.current;
    // The element focused when the dialog opened (the trigger) — restore to it
    // on close so keyboard users don't get dumped at the top of the document.
    const previouslyFocused = document.activeElement as HTMLElement | null;

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    if (panel) {
      const focusables = focusableWithin(panel);
      if (focusables.length > 0) {
        focusables[0].focus();
      } else {
        // Nothing focusable inside — focus the panel itself so AT lands in it
        // and Escape still works.
        panel.tabIndex = -1;
        panel.focus();
      }
    }

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        // Scope to the innermost dialog when nested.
        event.stopPropagation();
        onCloseRef.current();
        return;
      }
      if (event.key !== "Tab" || !panel) return;

      const focusables = focusableWithin(panel);
      if (focusables.length === 0) {
        event.preventDefault();
        return;
      }
      const first = focusables[0];
      const last = focusables[focusables.length - 1];
      const active = document.activeElement;

      if (event.shiftKey) {
        if (active === first || !panel.contains(active)) {
          event.preventDefault();
          event.stopPropagation();
          last.focus();
        }
      } else if (active === last || !panel.contains(active)) {
        event.preventDefault();
        event.stopPropagation();
        first.focus();
      }
    };

    // Panel-scoped (focus is trapped inside, so all key events bubble here);
    // keeps nested dialogs independent.
    panel?.addEventListener("keydown", onKeyDown);
    return () => {
      panel?.removeEventListener("keydown", onKeyDown);
      document.body.style.overflow = previousOverflow;
      // Only restore if the trigger is still in the document and focusable.
      if (previouslyFocused && document.contains(previouslyFocused)) {
        previouslyFocused.focus?.();
      }
    };
    // Engage on activation, release on deactivation/unmount. onClose is read
    // through a ref (stable) so it isn't a dependency; panelRef is stable too.
  }, [active]);

  return panelRef;
}
