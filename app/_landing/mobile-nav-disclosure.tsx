"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";

/**
 * Mobile nav for the marketing header (UI audit P1-4).
 *
 * There was no mobile treatment at all — verified by the audit and again here:
 * not one `sm:hidden` / `md:hidden` / `hidden md:` anywhere in `app/_landing/`.
 * Six nav links plus "Sign in" and "Start free" sat in one `flex-wrap` row
 * inside a `sticky top-0` header, so at 390px they wrapped to 3–4 rows —
 * 140–160px of header that never scrolls away, a third of the viewport,
 * permanently, at the top of the acquisition funnel.
 *
 * A client island rather than a client page: the marketing pages are server
 * components and should stay that way, so only this button ships JS.
 *
 * Closes on Escape and on outside click, because a sticky panel that traps the
 * reader is worse than the wrap it replaced.
 */
export function MobileNavDisclosure({
  links,
}: {
  links: { label: string; href: string }[];
}) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    const onPointer = (event: PointerEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener("keydown", onKey);
    document.addEventListener("pointerdown", onPointer);
    return () => {
      document.removeEventListener("keydown", onKey);
      document.removeEventListener("pointerdown", onPointer);
    };
  }, [open]);

  return (
    <div ref={rootRef} className="md:hidden">
      <button
        type="button"
        aria-expanded={open}
        aria-controls="marketing-mobile-nav"
        aria-label={open ? "Close menu" : "Open menu"}
        onClick={() => setOpen((value) => !value)}
        className="flex size-11 items-center justify-center rounded-[9px] border border-[rgba(247,243,234,0.16)] text-surface transition hover:bg-[rgba(247,243,234,0.08)]"
      >
        <span aria-hidden="true" className="flex flex-col gap-[3px]">
          <span className="block h-px w-4 bg-current" />
          <span className="block h-px w-4 bg-current" />
          <span className="block h-px w-4 bg-current" />
        </span>
      </button>

      {open ? (
        <div
          id="marketing-mobile-nav"
          className="absolute inset-x-0 top-full border-b border-[rgba(247,243,234,0.08)] bg-[rgba(15,36,27,0.98)] p-3 shadow-lift backdrop-blur-[14px]"
        >
          <ul className="flex flex-col gap-1">
            {links.map((link) => (
              <li key={link.label}>
                <Link
                  href={link.href}
                  onClick={() => setOpen(false)}
                  className="flex min-h-11 items-center rounded-[9px] px-3 text-[15px] font-medium text-surface transition hover:bg-[rgba(247,243,234,0.08)]"
                >
                  {link.label}
                </Link>
              </li>
            ))}
            {/* Sign in lives here on mobile, where the header hides it to make
                room for the primary CTA. */}
            <li className="sm:hidden">
              <Link
                href="/signin"
                onClick={() => setOpen(false)}
                className="flex min-h-11 items-center rounded-[9px] px-3 text-[15px] font-medium text-surface transition hover:bg-[rgba(247,243,234,0.08)]"
              >
                Sign in
              </Link>
            </li>
          </ul>
        </div>
      ) : null}
    </div>
  );
}
