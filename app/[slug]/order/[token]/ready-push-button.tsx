"use client";

import { useState } from "react";

import { usePushSupported } from "@/app/_components/use-push-supported";
import { subscribeToPush } from "@/lib/web-push-client";

type State = "idle" | "working" | "done" | "unsupported" | "denied" | "failed";

/**
 * Diner-side "notify me when it's ready" (PWA · web push). One tap: permission,
 * service-worker subscription, then POST /api/push/order with the venue slug +
 * order token so the kitchen's "ready" flips into a real notification even with
 * the tab closed. Hidden when the browser can't do push; rendered only when the
 * server has VAPID keys. Never affects the order itself.
 */
export function ReadyPushButton({
  slug,
  token,
  vapidPublicKey,
}: {
  slug: string;
  token: string;
  vapidPublicKey: string;
}) {
  const supported = usePushSupported();
  const [state, setState] = useState<State>("idle");

  async function enable() {
    setState("working");
    const result = await subscribeToPush(vapidPublicKey);
    if (!result.ok) {
      setState(result.reason);
      return;
    }
    const response = await fetch("/api/push/order", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ slug, token, subscription: result.subscription }),
    });
    setState(response.ok ? "done" : "failed");
  }

  if (!supported || state === "unsupported") return null;
  if (state === "done") {
    return (
      <p className="text-xs font-semibold text-forest">
        We&apos;ll ping this device the moment it&apos;s ready.
      </p>
    );
  }
  return (
    <div className="space-y-1">
      <button
        type="button"
        onClick={enable}
        disabled={state === "working"}
        className="rounded-pill border border-line bg-surface-elevated px-4 py-2 text-sm font-semibold text-ink disabled:opacity-60"
      >
        {state === "working" ? "Setting up…" : "Notify me when it's ready"}
      </button>
      {state === "denied" ? (
        <p className="text-xs text-muted">
          Notifications are blocked for this site — allow them in your browser to
          get a ping.
        </p>
      ) : null}
      {state === "failed" ? (
        <p className="text-xs text-muted">Couldn&apos;t set that up — this screen still updates on its own.</p>
      ) : null}
    </div>
  );
}
