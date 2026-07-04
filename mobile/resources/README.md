# App icon & splash source

Drop two source images here, then run `npm run assets` to generate every iOS +
Android icon/splash size automatically (via `@capacitor/assets`).

- **`icon.png`** — 1024×1024, your Prompt2Eat logo mark on the forest ground
  (`#0f241b`) OR transparent (the generator fills the background colour). No
  rounded corners — the OS masks them.
- **`splash.png`** — 2732×2732, logo centred in the middle ~1200px (safe area),
  forest background.

You can export both from the brand logo in `design/design_handoff_prompt2eat/
blocks/identity/` (01-logo-light / 04-logo-dark) or from your `venues.logoUrl`.

After adding them:

```bash
npm run assets   # writes into ios/ and android/ (run cap add first)
npm run sync
```
