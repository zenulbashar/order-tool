// ============================================================
// Prompt2Eat — Tailwind theme extension
// Merge `theme.extend` into your tailwind.config.js. Requires the
// three Google Fonts loaded (see tokens.css header). Works with
// Tailwind v3; for v4 translate these into @theme CSS vars instead.
// ============================================================

/** @type {import('tailwindcss').Config} */
module.exports = {
  theme: {
    extend: {
      colors: {
        ink: {
          DEFAULT: '#16241C',
          hover:   '#21342A',
          on:      '#F7F3EA', // text on dark
          onDim:   '#cdd6cf',
        },
        amber: {
          DEFAULT: '#F4B43C',
        },
        danger: {
          DEFAULT: '#E2553A',
          hover:   '#cf4527',
        },
        surface: {
          DEFAULT: '#FFFDF8',
          alt:     '#FBF8F1',
          hover:   '#F1EAD9',
        },
        muted:    { DEFAULT: '#6E756B', 2: '#86907f' },
        tertiary: '#a0987f',
        faint:    '#b6ab92',
        border: {
          card:  '#EFE7D6',
          input: '#e6ddcb',
          strong:'#d8cbb0',
        },
        disabled: { bg: '#e7dcc4', fg: '#b0a890' },
      },
      fontFamily: {
        display: ['"Bricolage Grotesque"', 'sans-serif'],
        body:    ['"Hanken Grotesk"', 'sans-serif'],
        mono:    ['"Space Mono"', 'monospace'],
      },
      borderRadius: {
        'btn-sm': '9px',
        'btn-md': '11px',
        'btn-lg': '13px',
        input:    '12px',
        card:     '22px',
        pill:     '999px',
      },
      boxShadow: {
        card:      '0 1px 3px rgba(20,30,25,.05), 0 20px 40px -20px rgba(20,30,25,.14)',
        'btn-hover':'0 9px 18px -8px rgba(22,36,28,.55)',
        cta:       '0 12px 22px -10px rgba(239,168,44,.55)',
        focus:     '0 0 0 4px rgba(244,180,60,.40)',
      },
      backgroundImage: {
        'amber-cta': 'linear-gradient(180deg,#F6BE4A,#EFA82C)',
      },
      keyframes: {
        'p2e-glow':    { '0%,100%': { opacity: '.45' }, '50%': { opacity: '.95' } },
        'p2e-think':   { '0%,80%,100%': { transform: 'translateY(0)', opacity: '.35' }, '40%': { transform: 'translateY(-6px)', opacity: '1' } },
        'p2e-shimmer': { '0%': { backgroundPosition: '-180% 0' }, '100%': { backgroundPosition: '180% 0' } },
        'p2e-spin':    { to: { transform: 'rotate(360deg)' } },
        'p2e-toastin': { '0%': { transform: 'translateX(22px)', opacity: '0' }, '100%': { transform: 'translateX(0)', opacity: '1' } },
        'p2e-pop':     { '0%': { transform: 'scale(0)' }, '55%': { transform: 'scale(1.25)' }, '100%': { transform: 'scale(1)' } },
        'p2e-ring':    { '0%': { boxShadow: '0 0 0 0 rgba(244,180,60,.5)' }, '100%': { boxShadow: '0 0 0 14px rgba(244,180,60,0)' } },
      },
      animation: {
        glow:    'p2e-glow 2s ease-in-out infinite',
        think:   'p2e-think 1.2s ease-in-out infinite',
        shimmer: 'p2e-shimmer 1.4s linear infinite',
        spin:    'p2e-spin .7s linear infinite',
        toastin: 'p2e-toastin .25s ease-out',
        pop:     'p2e-pop .3s ease-out',
        ring:    'p2e-ring 1.4s ease-out infinite',
      },
    },
  },
};
