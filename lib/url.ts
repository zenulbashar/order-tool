import { headers } from "next/headers";

/**
 * Absolute base URL for building Stripe Connect onboarding return/refresh URLs.
 * Prefers AUTH_URL (already set in production for Auth.js magic-link callbacks);
 * falls back to the request's forwarded host for local/preview. Stripe requires
 * absolute, publicly-reachable URLs for account links.
 */
export async function getBaseUrl(): Promise<string> {
  const configured = process.env.AUTH_URL;
  if (configured && configured.length > 0) {
    return configured.replace(/\/+$/, "");
  }

  const headerList = await headers();
  const host =
    headerList.get("x-forwarded-host") ?? headerList.get("host") ?? null;
  const proto = headerList.get("x-forwarded-proto") ?? "https";
  if (!host) {
    throw new Error("Cannot determine base URL: no AUTH_URL and no host header.");
  }
  return `${proto}://${host}`;
}
