# CLAUDE.md — Prompt2Eat implementation guide

You are implementing the **Prompt2Eat** UI into a real app. This folder is a
**design reference bundle**, not shippable code. Rebuild the designs in the
target codebase's own environment (React/Vue/SwiftUI/etc.) using its existing
patterns, and lift the design values from the token files here.

## What's in this folder
- `README.md` — full design spec: every screen, component, state, token.
- `tokens.css` — **paste-ready** CSS custom properties + keyframes.
- `tailwind.theme.js` — **paste-ready** Tailwind `theme.extend` (colors, fonts, radii, shadows, animations).
- `*.dc.html` — the interactive prototypes. Open in a browser to see the intended look/behavior. They render via `support.js` with **inline styles** (no classes) — read them to copy exact per-state styling.
- `P2E-Components.dc.html` is the source of truth for interaction states (buttons, inputs, badges, toasts, loading, empty states).

## Setup steps
1. Load the three Google Fonts (Bricolage Grotesque, Hanken Grotesk, Space Mono) — see header of `tokens.css`.
2. Adopt tokens: either paste `tokens.css` into your global stylesheet, **or** merge `tailwind.theme.js` into your Tailwind config. Pick the one that matches your stack — don't hardcode hex/px in components.
3. Build primitives first (Button, Input/Select, Card, Badge, Toast), matching the states in `P2E-Components.dc.html`, then assemble the Owner/Diner/Roadmap screens.

## Design language (quick reference)
- **Palette:** deep forest-green ink `#16241C` + warm cream surfaces `#FFFDF8`/`#FBF8F1` + a single amber accent `#F4B43C`. Destructive is warm coral `#E2553A`.
- **Type:** Bricolage Grotesque for display/headings (tight tracking `-0.02em`…`-0.035em`), Hanken Grotesk for body/UI, Space Mono for uppercase eyebrows/micro-labels (wide tracking `0.1em`–`0.2em`).
- **Focus:** every interactive element gets the amber ring `0 0 0 4px rgba(244,180,60,.40)`.
- **Radii:** buttons 9–13px, inputs 12px, cards 22px, pills 999px.
- **Motion:** short (~150–250ms) ease-out; loaders spin `.7s linear`.

## Reference component: Button (React + tokens.css)
Match this behavior; adapt to your component library.

```jsx
// variant: 'primary' | 'secondary' | 'ghost' | 'destructive'
// size: 'sm' | 'md' | 'lg'
function Button({ variant='primary', size='md', loading, disabled, children, ...rest }) {
  const pad = { sm:'6px 12px', md:'9px 16px', lg:'12px 22px' }[size];
  const radius = { sm:'var(--p2e-radius-btn-sm)', md:'var(--p2e-radius-btn-md)', lg:'var(--p2e-radius-btn-lg)' }[size];
  const fontSize = { sm:12, md:13, lg:14 }[size];
  const variants = {
    primary:     { background:'var(--p2e-ink)',        color:'var(--p2e-on-ink)', border:'1px solid var(--p2e-ink)' },
    secondary:   { background:'var(--p2e-surface)',    color:'var(--p2e-ink)',    border:'1px solid var(--p2e-border-input-strong)' },
    ghost:       { background:'transparent',           color:'var(--p2e-ink)',    border:'1px solid transparent' },
    destructive: { background:'var(--p2e-danger)',     color:'#fff',              border:'1px solid var(--p2e-danger)' },
  }[variant];
  return (
    <button
      disabled={disabled || loading}
      style={{
        font:`700 ${fontSize}px var(--p2e-font-body)`, padding:pad, borderRadius:radius,
        display:'inline-flex', alignItems:'center', gap:8, cursor:'pointer',
        transition:'transform var(--p2e-dur) var(--p2e-ease), box-shadow var(--p2e-dur) var(--p2e-ease)',
        ...variants,
        ...(disabled ? { background:'var(--p2e-disabled-bg)', color:'var(--p2e-disabled-fg)', border:'1px solid var(--p2e-disabled-bg)', cursor:'not-allowed' } : {}),
      }}
      {...rest}
    >
      {loading && <Spinner variant={variant} />} {children}
    </button>
  );
}
// Hover (non-disabled): translateY(-1px) + boxShadow var(--p2e-shadow-btn-hover); ghost gets background var(--p2e-surface-hover).
// Focus: boxShadow var(--p2e-focus-ring).
// Spinner: 13px circle, 2px border, transparent w/ one colored edge, animation p2e-spin .7s linear infinite.
//   amber edge on primary, ink edge otherwise.
// Marketing CTA variant: background var(--p2e-amber-grad), color ink, boxShadow var(--p2e-shadow-cta), font-family display.
```

## Reference component: Input
```jsx
function Input({ error, ...rest }) {
  return (
    <input
      style={{
        font:`500 15px var(--p2e-font-body)`, color:'var(--p2e-ink)',
        padding:'11px 14px', borderRadius:'var(--p2e-radius-input)',
        background:'var(--p2e-surface)',
        border:`1px solid ${error ? 'var(--p2e-danger)' : 'var(--p2e-border-input)'}`,
        outline:'none', transition:'box-shadow var(--p2e-dur) var(--p2e-ease)',
      }}
      // ::placeholder → Space Mono, color var(--p2e-text-faint)
      // :focus → boxShadow var(--p2e-focus-ring), border amber (error keeps danger border)
      {...rest}
    />
  );
}
```

## Card
`background: var(--p2e-surface); border:1px solid var(--p2e-border-card); border-radius: var(--p2e-radius-card); box-shadow: var(--p2e-shadow-card); padding: 24px 26px;`

## Icons & assets
No custom icon set or raster images — the prototypes use Unicode glyphs (`→ ＋ ✦ ✕`) and CSS shapes. **Replace with your app's icon library** (Lucide, Heroicons, SF Symbols…).

## Notes
- The prototypes use `design_doc_mode: canvas` (absolutely-positioned panels on a board). That's a presentation device — implement your app's real responsive layout, don't copy the absolute positions.
- Do not ship `support.js` or the `.dc.html` files — they're the viewer, not the app.
