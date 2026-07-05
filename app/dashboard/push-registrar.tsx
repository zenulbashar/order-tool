"use client";

import { useEffect } from "react";

/**
 * Native push bridge. When the dashboard runs INSIDE the Capacitor owner app,
 * this asks for notification permission, registers with APNs/FCM via the plugin
 * the native shell injects on `window.Capacitor`, and POSTs the device token to
 * `/api/push/register` (authenticated by the owner session cookie). On the plain
 * web (no Capacitor) it is a no-op. Uses the injected global directly so the web
 * app takes NO dependency on Capacitor.
 */

type PushPlugin = {
  checkPermissions: () => Promise<{ receive: string }>;
  requestPermissions: () => Promise<{ receive: string }>;
  register: () => Promise<void>;
  addListener: (
    event: string,
    cb: (data: unknown) => void,
  ) => Promise<unknown> | unknown;
};

type CapacitorGlobal = {
  isNativePlatform?: () => boolean;
  getPlatform?: () => string;
  Plugins?: { PushNotifications?: PushPlugin };
};

export function PushRegistrar() {
  useEffect(() => {
    const cap = (window as unknown as { Capacitor?: CapacitorGlobal }).Capacitor;
    if (!cap?.isNativePlatform?.() || !cap.Plugins?.PushNotifications) return;

    const push = cap.Plugins.PushNotifications;
    const platform = cap.getPlatform?.() === "ios" ? "ios" : "android";
    let cancelled = false;

    async function setup() {
      try {
        let perm = await push.checkPermissions();
        if (
          perm.receive === "prompt" ||
          perm.receive === "prompt-with-rationale"
        ) {
          perm = await push.requestPermissions();
        }
        if (cancelled || perm.receive !== "granted") return;

        await push.addListener("registration", (data: unknown) => {
          const token = (data as { value?: string })?.value;
          if (!token) return;
          void fetch("/api/push/register", {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({ token, platform }),
          }).catch(() => {});
        });

        await push.register();
      } catch {
        // Native bridge hiccup — skip silently; retried on next mount.
      }
    }

    void setup();
    return () => {
      cancelled = true;
    };
  }, []);

  return null;
}
