"use client";

import { useSyncExternalStore } from "react";

import { pushSupported } from "@/lib/web-push-client";

function subscribeNever() {
  return () => {};
}

/**
 * Whether THIS browser can do Web Push. Read through useSyncExternalStore so the
 * server render assumes "yes" (the button appears in the HTML) and the client
 * corrects it on hydration without a setState-in-effect cascade.
 */
export function usePushSupported(): boolean {
  return useSyncExternalStore(subscribeNever, pushSupported, () => true);
}
