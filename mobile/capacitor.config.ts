import type { CapacitorConfig } from "@capacitor/cli";

/**
 * Prompt2Eat — Owner app (Capacitor shell · hybrid phase 1).
 *
 * The owner app loads the HOSTED Next.js owner dashboard in a native WebView
 * (`server.url`) — reusing 100% of the web app + design — and layers native
 * capabilities (push, splash, status bar, in-app browser) on top. Because the
 * app is server-rendered (server actions + DB + auth), it can't be statically
 * bundled, so we point the shell at the live deployment.
 *
 * Set `P2E_APP_URL` to your deployed AUTH_URL (the domain the app should load),
 * e.g. `P2E_APP_URL=https://app.prompt2eat.com npx cap sync`. During local
 * development against `next dev`, point it at your machine's LAN IP over http
 * and flip `cleartext` on (Android) — see mobile/README.md.
 *
 * "View storefront" links in the dashboard use `target="_blank"`, which
 * Capacitor opens in the device browser — that is the owner-app storefront view.
 */
const SERVER_URL = process.env.P2E_APP_URL ?? "https://app.prompt2eat.com";
const APP_HOST = (() => {
  try {
    return new URL(SERVER_URL).host;
  } catch {
    return "app.prompt2eat.com";
  }
})();

const config: CapacitorConfig = {
  // ⚠ Bundle id is PERMANENT once the app is first submitted — confirm before
  // your first TestFlight / Play Console upload. `.owner` reserves the
  // namespace for a future `.diner` app.
  appId: "au.com.zaleit.prompt2eat.owner",
  appName: "Prompt2Eat",
  webDir: "www",
  backgroundColor: "#0f241b",
  server: {
    url: SERVER_URL,
    // Keep the dashboard origin inside the WebView; everything else (and any
    // target="_blank", e.g. View storefront) opens in the system browser.
    allowNavigation: [APP_HOST],
    androidScheme: "https",
    iosScheme: "https",
    // Set to true ONLY for local http dev against `next dev` on your LAN.
    cleartext: false,
  },
  ios: {
    contentInset: "always",
    limitsNavigationsToAppBoundDomains: false,
  },
  android: {
    allowMixedContent: false,
  },
  plugins: {
    SplashScreen: {
      backgroundColor: "#0f241b",
      showSpinner: false,
      launchAutoHide: true,
      launchShowDuration: 600,
    },
    StatusBar: {
      style: "LIGHT",
      backgroundColor: "#0f241b",
    },
    PushNotifications: {
      presentationOptions: ["badge", "sound", "alert"],
    },
  },
};

export default config;
