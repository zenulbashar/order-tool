"use client";

import { useSyncExternalStore } from "react";

/* -------------------------------------------------------------------------- */
/*  Per-device sidebar collapsed/expanded preference.                          */
/*                                                                            */
/*  Mirrors kitchen-sound.ts exactly: a module-level listener set + localStorage*/
/*  read SSR-safely via useSyncExternalStore with a stable getServerSnapshot   */
/*  (false = expanded). A collapsed-preferring device therefore renders        */
/*  expanded on the server / first paint and snaps to collapsed on hydration   */
/*  — the same accepted tradeoff as the sound toggle. Per-device (a kitchen    */
/*  display and the owner's laptop can differ), not an account setting.        */
/* -------------------------------------------------------------------------- */

const COLLAPSED_KEY = "p2e:sidebar:collapsed";

const listeners = new Set<() => void>();

function readCollapsed(): boolean {
  try {
    return window.localStorage.getItem(COLLAPSED_KEY) === "1";
  } catch {
    return false;
  }
}

function subscribe(callback: () => void) {
  listeners.add(callback);
  // Cross-tab sync: another tab toggling the rail updates this one too.
  window.addEventListener("storage", callback);
  return () => {
    listeners.delete(callback);
    window.removeEventListener("storage", callback);
  };
}

const getSnapshot = () => readCollapsed();
const getServerSnapshot = () => false;

/** Reactive read of the per-device collapsed preference (default expanded). */
export function useSidebarCollapsed(): boolean {
  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
}

/** Persist the preference and notify subscribers in this tab. */
export function setSidebarCollapsed(collapsed: boolean): void {
  try {
    window.localStorage.setItem(COLLAPSED_KEY, collapsed ? "1" : "0");
  } catch {
    // Private mode / storage disabled — the toggle simply won't persist.
  }
  for (const listener of listeners) listener();
}
