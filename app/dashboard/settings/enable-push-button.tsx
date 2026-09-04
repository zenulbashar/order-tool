"use client";

import { useState } from "react";

import { usePushSupported } from "@/app/_components/use-push-supported";
import { subscribeToPush } from "@/lib/web-push-client";

type State = "idle" | "working" | "done" | "unsupported" | "denied" | "failed";

/**
 * Owner-side Web Push opt-in: subscribes THIS browser (installed PWA or plain
 * tab) to new-order pushes for the current venue. Registers through the same
 * /api/push/register endpoint the native app uses, with the subscription JSON
 * standing in for a device token. Rendered only when the server has VAPID keys.
 */
export function EnablePushButton({ vapidPublicKey }: { vapidPublicKey: string }) {
  const supported = usePushSupported();
  const [state, setState] = useState<State>("idle");

  async function enable() {
    setState("working");
    const result = await subscribeToPush(vapidPublicKey);
    if (!result.ok) {
      setState(result.reason);
      return;
    }
    const response = await fetch("/api/push/register", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ token: result.subscription, platform: "web" }),
    });
    setState(response.ok ? "done" : "failed");
  }

  if (!supported || state === "unsupported") {
    return (
      <p className="text-xs text-muted">
        This browser can&apos;t receive push notifications. On iPhone, add
        Prompt2Eat to your Home Screen first, then open it from there.
      </p>
    );
  }
  if (state === "done") {
    return <p className="text-xs font-semibold text-forest">Enabled on this device.</p>;
  }
  return (
    <div className="space-y-1">
      <button
        type="button"
        onClick={enable}
        disabled={state === "working"}
        className="rounded-pill bg-ink px-4 py-2 text-sm font-semibold text-surface-elevated disabled:opacity-60"
      >
        {state === "working" ? "Enabling…" : "Enable on this device"}
      </button>
      {state === "denied" ? (
        <p className="text-xs text-muted">
          Notifications are blocked for this site. Allow them in your browser
          settings and try again.
        </p>
      ) : null}
      {state === "failed" ? (
        <p className="text-xs text-muted">Couldn&apos;t enable — please try again.</p>
      ) : null}
    </div>
  );
}
