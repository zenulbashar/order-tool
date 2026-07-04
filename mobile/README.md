# Prompt2Eat — Owner app (iOS + Android)

A native store app for **venue owners/staff**, built with **Capacitor** as
**hybrid phase 1**: a native iOS/Android shell that loads the hosted Prompt2Eat
owner dashboard in a WebView, so you get **every dashboard feature and the exact
design on both stores immediately** — plus native capabilities (push, splash,
status bar, in-app browser). Later phases replace high-value screens (kitchen
orders, checkout) with fully-native views without re-shipping the rest.

> This is an **isolated project** — its own `package.json` and tooling. It does
> **not** affect the Next.js web app's build or deploy; the web app is unchanged.

## How it works

- The shell points at your **live deployment** (`server.url` in
  `capacitor.config.ts`). The app is server-rendered (server actions, DB, auth),
  so it can't be bundled statically — the native app is a branded, native-capable
  container around the hosted owner app.
- **View storefront**: the dashboard's "View storefront ↗" links use
  `target="_blank"`, which Capacitor opens in the **device browser** — that's the
  owner's storefront-in-a-browser view. (No web changes needed.)
- **Owner-first**: the app opens `/` → sign-in → `/dashboard`. A separate diner
  app is a future project (bundle id namespace `au.com.zaleit.prompt2eat.diner`).

## Prerequisites

**Accounts** (buy these first — they gate submission):
- **Apple Developer Program** — US$99/year (required for TestFlight + App Store).
- **Google Play Developer** — US$25 one-time.

**Tooling** (on your Mac / PC — not this cloud repo):
- Node 20+.
- **iOS** (Mac only): Xcode 15+, CocoaPods (`sudo gem install cocoapods`).
- **Android**: Android Studio + JDK 17.

## First-time setup

```bash
cd mobile
npm install

# 1) Point the shell at your deployment (your AUTH_URL):
export P2E_APP_URL=https://your-app-domain.com

# 2) Add your brand icon + splash (see resources/README.md), then:
npm run assets            # generates all icon/splash sizes

# 3) Generate the native projects:
npx cap add ios
npx cap add android

# 4) Sync config + assets into them:
npm run sync

# 5) Open in the native IDEs and run on a simulator/device:
npm run open:ios          # Xcode → pick a simulator → ▶
npm run open:android      # Android Studio → ▶
```

`ios/` and `android/` are generated locally by `cap add`. You can commit them
for reproducible builds (the heavy build artifacts inside them are gitignored).

## Local development (against `next dev`)

To test the shell against your dev server instead of production:

1. Run the web app: `npm run dev` (repo root) and note your machine's LAN IP.
2. `export P2E_APP_URL=http://192.168.x.x:3000`
3. In `capacitor.config.ts`, set `server.cleartext: true` (Android needs it for
   http). **Revert to `false` before building for release.**
4. `npm run sync && npm run open:ios` (or android).

## ⚠ #1 thing to wire: magic-link sign-in (deep links)

The owner signs in with an emailed **magic link**. Tapped from the Mail app, that
link opens the **system browser**, not this app — so the app's WebView would stay
signed out. Fix it with **Universal Links (iOS) + App Links (Android)** so the
magic-link domain opens the app, then load the link inside the WebView:

1. Host **`/.well-known/apple-app-site-association`** (iOS) and
   **`/.well-known/assetlinks.json`** (Android) on your `P2E_APP_URL` domain,
   associating it with this app id + your Apple Team ID / Android signing SHA-256.
2. Add the **Associated Domains** capability (Xcode) and an **intent filter**
   (Android manifest) for the domain.
3. Handle the incoming link with `@capacitor/app`'s `appUrlOpen` listener and
   navigate the WebView to that URL so Auth.js completes the session in-app.

Until this is wired, a workable interim is to sign in **inside the app's WebView**
(request the link, open it in the same WebView) — clunky but functional for
TestFlight testing. Prioritise the deep-link setup before a public launch.

## Push notifications (native win — seam ready)

`@capacitor/push-notifications` is installed and configured. To light it up:

1. **APNs** (Apple) + **FCM** (Firebase) credentials; add `google-services.json`
   (Android) and enable Push in the Xcode capabilities.
2. Add a small web-side bridge that, when `window.Capacitor?.isNativePlatform()`,
   registers for push and POSTs the device token to a new endpoint
   (e.g. `/api/push/register`) stored against the venue.
3. Send from the server on order events (reuse the existing `after()` webhook
   seam that already fires on `payment_intent.succeeded`) → "New order · Table 4".

This is the biggest reason to ship native: instant new-order / order-ready alerts.

## Store submission (high level)

- **iOS**: in Xcode, set your Team + a real bundle id, Product → Archive →
  Distribute → App Store Connect → TestFlight → submit for review.
- **Android**: Build → Generate Signed Bundle (`.aab`) → Play Console → internal
  testing → production. Apple's Guideline 4.2 (min functionality) is why the
  push/camera/native-share layer matters — don't ship a bare WebView.

## Config reference (`capacitor.config.ts`)

| Field | What |
|---|---|
| `appId` | `au.com.zaleit.prompt2eat.owner` — **permanent after first submit; confirm it.** |
| `appName` | `Prompt2Eat` (App Store display name is set separately in the stores). |
| `server.url` | Your deployment; from `P2E_APP_URL`, default `https://app.prompt2eat.com`. |
| `server.cleartext` | `true` only for local http dev. |
| `plugins.SplashScreen` / `StatusBar` | Forest brand chrome (`#0f241b`). |

## Roadmap (hybrid)

1. **Now** — Capacitor shell, all owner features on both stores. ✅ this scaffold
2. **Next** — magic-link deep links, push notifications, native camera for menu/
   invoice photos, native share for Studio exports.
3. **Later** — replace hot screens (kitchen orders board, checkout) with
   fully-native React views for 60fps feel, keeping the rest in the shell.
