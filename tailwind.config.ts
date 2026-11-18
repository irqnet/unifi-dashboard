import type { Config } from 'tailwindcss';

const config: Config = {
  content: ['./src/**/*.{ts,tsx}'],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        noc: {
          bg: '#0a0d12',
          panel: '#11161e',
          raised: '#161d27',
          line: '#222b38',
          muted: '#7d8ba1',
          text: '#d7dee9',
        },
        accent: {
          DEFAULT: '#38bdf8',
          down: '#38bdf8',
          up: '#a78bfa',
        },
      },
      fontFamily: {
        sans: ['ui-sans-serif', 'system-ui', '-apple-system', 'Segoe UI', 'Roboto', 'sans-serif'],
        mono: ['ui-monospace', 'SFMono-Regular', 'Menlo', 'Consolas', 'monospace'],
      },
    },
  },
  plugins: [],
};

export default config;
