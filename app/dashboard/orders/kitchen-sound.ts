"use client";

import { useSyncExternalStore } from "react";

/* -------------------------------------------------------------------------- */
/*  Per-device "new order" sound preference + a code-generated beep.           */
/*                                                                            */
/*  The on/off preference is a KITCHEN-DEVICE setting (a tablet on the pass    */
/*  and the owner's laptop want independent defaults), so it lives in          */
/*  localStorage, NOT the account — default OFF. Read SSR-safely via           */
/*  useSyncExternalStore with a stable getServerSnapshot (false), the same     */
/*  pattern as the Live/Paused indicator and ElapsedTime's ticker, so there's  */
/*  no hydration mismatch. The beep is a short WebAudio oscillator — no binary */
/*  asset, nothing in /public.                                                 */
/* -------------------------------------------------------------------------- */

const SOUND_KEY = "p2e:orders:sound";

const listeners = new Set<() => void>();

function readEnabled(): boolean {
  try {
    return window.localStorage.getItem(SOUND_KEY) === "1";
  } catch {
    return false;
  }
}

function subscribe(callback: () => void) {
  listeners.add(callback);
  // Cross-tab sync: another tab flipping the pref updates this one too.
  window.addEventListener("storage", callback);
  return () => {
    listeners.delete(callback);
    window.removeEventListener("storage", callback);
  };
}

// localStorage value is stable between writes, so returning it per-call is safe
// (boolean compared by Object.is — no re-render churn).
const getSnapshot = () => readEnabled();
const getServerSnapshot = () => false;

/** Reactive read of the per-device sound preference (default OFF). */
export function useSoundEnabled(): boolean {
  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
}

/** Persist the preference and notify subscribers in this tab. */
export function setSoundEnabled(enabled: boolean): void {
  try {
    window.localStorage.setItem(SOUND_KEY, enabled ? "1" : "0");
  } catch {
    // Private mode / storage disabled — the toggle simply won't persist.
  }
  for (const listener of listeners) listener();
}

/* — WebAudio beep — */

type WebkitWindow = typeof window & {
  webkitAudioContext?: typeof AudioContext;
};

let audioContext: AudioContext | null = null;

function ensureContext(): AudioContext | null {
  if (typeof window === "undefined") return null;
  if (audioContext === null) {
    const Ctor =
      window.AudioContext ?? (window as WebkitWindow).webkitAudioContext;
    if (!Ctor) return null;
    audioContext = new Ctor();
  }
  // Autoplay policy: a context created without a gesture starts suspended;
  // resuming from within a user gesture (the toggle) unlocks it.
  if (audioContext.state === "suspended") void audioContext.resume();
  return audioContext;
}

/**
 * Create/resume the AudioContext. MUST be called from a user gesture (turning
 * the sound toggle on) so the browser's autoplay policy lets later beeps play.
 */
export function unlockAudio(): void {
  ensureContext();
}

/** Short two-tone chime for a freshly-arrived order. No-op if audio is blocked. */
export function playNewOrderBeep(): void {
  const ctx = ensureContext();
  if (!ctx) return;

  const start = ctx.currentTime;
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  osc.type = "sine";
  osc.frequency.setValueAtTime(880, start);
  osc.frequency.setValueAtTime(1175, start + 0.12);

  // Quick attack, gentle decay — audible but not jarring on a quiet pass.
  gain.gain.setValueAtTime(0.0001, start);
  gain.gain.exponentialRampToValueAtTime(0.18, start + 0.02);
  gain.gain.exponentialRampToValueAtTime(0.0001, start + 0.4);

  osc.connect(gain);
  gain.connect(ctx.destination);
  osc.start(start);
  osc.stop(start + 0.42);
}
