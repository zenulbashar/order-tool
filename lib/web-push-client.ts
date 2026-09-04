/**
 * Browser side of Web Push, shared by the owner's "Enable on this device" and
 * the diner's "Notify me when it's ready" buttons. Registers the service
 * worker, asks permission, subscribes with the server's VAPID public key, and
 * hands back the subscription JSON for the caller to POST. Pure browser code —
 * no React, no server imports.
 */

export type SubscribeOutcome =
  | { ok: true; subscription: string }
  | { ok: false; reason: "unsupported" | "denied" | "failed" };

function urlBase64ToUint8Array(base64: string): Uint8Array<ArrayBuffer> {
  const padding = "=".repeat((4 - (base64.length % 4)) % 4);
  const normalised = (base64 + padding).replace(/-/g, "+").replace(/_/g, "/");
  const raw = atob(normalised);
  const bytes = new Uint8Array(new ArrayBuffer(raw.length));
  for (let i = 0; i < raw.length; i += 1) bytes[i] = raw.charCodeAt(i);
  return bytes;
}

export function pushSupported(): boolean {
  return (
    typeof window !== "undefined" &&
    "serviceWorker" in navigator &&
    "PushManager" in window &&
    "Notification" in window
  );
}

export async function subscribeToPush(vapidPublicKey: string): Promise<SubscribeOutcome> {
  if (!pushSupported()) return { ok: false, reason: "unsupported" };
  try {
    const permission = await Notification.requestPermission();
    if (permission !== "granted") return { ok: false, reason: "denied" };
    const registration = await navigator.serviceWorker.register("/sw.js", { scope: "/" });
    await navigator.serviceWorker.ready;
    const existing = await registration.pushManager.getSubscription();
    const subscription =
      existing ??
      (await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(vapidPublicKey),
      }));
    return { ok: true, subscription: JSON.stringify(subscription.toJSON()) };
  } catch {
    return { ok: false, reason: "failed" };
  }
}
