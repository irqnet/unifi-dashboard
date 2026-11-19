import containerQueries from '@tailwindcss/container-queries';
import type { Config } from 'tailwindcss';

/** Farbe aus CSS-Variable (RGB-Tripel), damit Hell/Dunkel nur die Variablen tauscht. */
const v = (name: string) => `rgb(var(--${name}) / <alpha-value>)`;

/** Theme-abhängige Tönungen: im Dunkel-Modus die Tailwind-Originale, im Hell-Modus kräftigere Töne (siehe globals.css). */
const tint = (color: string, shades: number[]) => Object.fromEntries(shades.map((s) => [s, v(`${color}-${s}`)]));

const config: Config = {
  content: ['./src/**/*.{ts,tsx}'],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        noc: {
          bg: v('noc-bg'),
          panel: v('noc-panel'),
          raised: v('noc-raised'),
          line: v('noc-line'),
          muted: v('noc-muted'),
          text: v('noc-text'),
          // Überschriften (Dunkel: weiß, Hell: schwarz)
          strong: v('noc-strong'),
          // Admin-Bereich (macOS-Einstellungen-Stil)
          group: v('noc-group'),
          sidebar: v('noc-sidebar'),
          sheet: v('noc-sheet'),
          soft: v('noc-soft'),
          faint: v('noc-faint'),
          off: v('noc-off'),
          seg: v('noc-seg'),
          radio: v('noc-radio'),
        },
        // Vordergrund-Overlay für dezente Flächen/Linien (Dunkel: weiß, Hell: schwarz)
        fg: v('fg'),
        accent: {
          DEFAULT: v('c-down'),
          down: v('c-down'),
          up: v('c-up'),
        },
        sky: tint('sky', [300, 400]),
        violet: tint('violet', [300]),
        rose: tint('rose', [200, 300, 400]),
        emerald: tint('emerald', [300, 400]),
        amber: tint('amber', [100, 200, 300]),
        yellow: tint('yellow', [300]),
      },
      fontFamily: {
        sans: ['ui-sans-serif', 'system-ui', '-apple-system', 'Segoe UI', 'Roboto', 'sans-serif'],
        mono: ['ui-monospace', 'SFMono-Regular', 'Menlo', 'Consolas', 'monospace'],
      },
    },
  },
  plugins: [containerQueries],
};

export default config;
