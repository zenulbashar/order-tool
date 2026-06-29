"use client";

import { useState } from "react";

/**
 * Copy-the-storefront-link affordance (Phase 3c). The URL is built server-side
 * (getBaseUrl + slug) and passed in; this only handles the clipboard write and
 * the transient "Copied" feedback. Falls back silently if the clipboard API is
 * unavailable.
 */
export function CopyLink({ url }: { url: string }) {
  const [copied, setCopied] = useState(false);

  async function copy() {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      // Clipboard unavailable (older browser / insecure context) — no-op; the
      // link is shown in full beside the button so it can be copied by hand.
    }
  }

  return (
    <div className="flex items-center gap-2">
      <span className="min-w-0 flex-1 truncate rounded-md border border-sand bg-surface px-3 py-2 text-sm text-ink">
        {url}
      </span>
      <button
        type="button"
        onClick={copy}
        className="shrink-0 rounded-md border border-sand px-3 py-2 text-sm font-medium text-ink transition hover:bg-surface"
      >
        {copied ? "Copied" : "Copy"}
      </button>
    </div>
  );
}
