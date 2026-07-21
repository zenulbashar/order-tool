# Responsive Audit

Method: static review of Tailwind breakpoints and layout patterns across the
route tree. **Runtime device testing (the exact iPhone/iPad/Android/desktop
matrix) requires a browser and is listed as a release gate, not verified here.**

## What the code does well

- **Mobile-first breakpoints** throughout (`sm: md: lg: xl:`), with the owner
  dashboard using a genuine off-canvas drawer on mobile and a sticky rail on
  desktop (`app/dashboard/sidebar.tsx`), including a 76px collapsed rail.
- **Dynamic viewport units** (`max-h-[90dvh]`, `h-dvh`) on dialogs and the
  sidebar — correct handling of mobile browser chrome.
- **Fluid grids** with column counts that scale (`grid-cols-2 sm:grid-cols-3
  md:grid-cols-4` in media; `lg:grid-cols-[1fr_300px]` in tables).
- **Bottom-sheet on mobile → centered/docked on desktop** for dialogs
  (`items-end … sm:items-center`, concierge docks bottom-right on `lg`).
- **Touch targets** meet the 44px floor on primary controls (`h-11`).
- **Print** styles are scoped (`print:hidden` chrome, `@page` margins) so kitchen
  tickets and QR sheets print clean.

## Observations / watch-items

- **Wide-monitor fill** was recently addressed (commit `a284850` "fill the content
  width on wide screens"). Re-verify no center-float gutters remain on 27"/32"
  after the settings two-pane change.
- **Owner-supplied images** use raw `<img>` (not `next/image`) because remote
  hosts aren't configured; ensure `object-cover` + fixed aspect ratios prevent
  layout shift (they currently do in media/menu).
- **Long content** (menu item names, table labels, customer names) uses `truncate`
  / `break-words` in most places — spot-check the order ticket and sidebar venue
  name at the narrowest widths.

## Not verified (release gates)
Physical/emulated rendering on: iPhone SE, iPhone 16, Pixel, iPad Mini, iPad Pro,
Android tablet, 13"/15"/24"/27"/32"/ultrawide, portrait + landscape, foldables.
Check for overflow, clipped content, and correct scaling. This is a Playwright
viewport-matrix job or a manual device pass — see ReleaseChecklist.md.
