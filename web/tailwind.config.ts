import type { Config } from 'tailwindcss';

// Colors resolve to CSS-variable RGB channels so the whole palette can flip for
// dark mode (see globals.css) while Tailwind's /opacity modifiers keep working.
const rgb = (v: string) => `rgb(var(${v}) / <alpha-value>)`;

const config: Config = {
  darkMode: 'class',
  content: ['./app/**/*.{ts,tsx}', './components/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        bg: rgb('--c-bg'),
        surface: rgb('--c-surface'),
        surfaceAlt: rgb('--c-surface-alt'),
        hairline: rgb('--c-hairline'),
        ink: rgb('--c-ink'),
        muted: rgb('--c-muted'),
        accent: rgb('--c-accent'),
        busyLow: rgb('--c-busy-low'),
        busyModerate: rgb('--c-busy-mod'),
        busyHigh: rgb('--c-busy-high'),
        busySevere: rgb('--c-busy-severe'),
      },
      fontFamily: {
        sans: ['var(--font-inter)', 'system-ui', 'sans-serif'],
      },
      borderRadius: {
        '2xl': '20px',
      },
      boxShadow: {
        // Whisper-soft layered elevation instead of borders.
        card: '0 1px 2px rgba(15,27,45,0.04), 0 8px 24px rgba(15,27,45,0.06)',
        hover: '0 2px 4px rgba(15,27,45,0.05), 0 12px 32px rgba(15,27,45,0.10)',
        float: '0 4px 16px rgba(15,27,45,0.12)',
      },
      letterSpacing: {
        kicker: '0.16em',
      },
      keyframes: {
        breathe: {
          '0%': { transform: 'scale(1)', opacity: '0.5' },
          '100%': { transform: 'scale(1.7)', opacity: '0' },
        },
        rise: {
          '0%': { transform: 'translateY(8px)', opacity: '0' },
          '100%': { transform: 'translateY(0)', opacity: '1' },
        },
        slideSwap: {
          '0%': { transform: 'translateY(10px)', opacity: '0' },
          '100%': { transform: 'translateY(0)', opacity: '1' },
        },
        sweep: {
          '0%': { transform: 'translateX(-100%)', opacity: '0' },
          '40%': { opacity: '0.6' },
          '100%': { transform: 'translateX(100%)', opacity: '0' },
        },
        spinOnce: {
          '0%': { transform: 'rotate(0deg)' },
          '100%': { transform: 'rotate(360deg)' },
        },
        pulseDot: {
          '0%,100%': { transform: 'scale(1)', opacity: '1' },
          '50%': { transform: 'scale(0.7)', opacity: '0.55' },
        },
        updatePulse: {
          '0%': { transform: 'scale(1)', opacity: '0.6' },
          '30%': { transform: 'scale(1.06)', opacity: '1' },
          '100%': { transform: 'scale(1)', opacity: '1' },
        },
        fadeIn: {
          '0%': { opacity: '0' },
          '100%': { opacity: '1' },
        },
        sheetUp: {
          '0%': { transform: 'translateY(100%)' },
          '100%': { transform: 'translateY(0)' },
        },
        slideInRight: {
          '0%': { transform: 'translateX(24px)', opacity: '0' },
          '100%': { transform: 'translateX(0)', opacity: '1' },
        },
      },
      animation: {
        rise: 'rise 220ms ease-out both',
        slideSwap: 'slideSwap 350ms ease-out both',
        sweep: 'sweep 600ms ease-out',
        spinOnce: 'spinOnce 700ms ease-in-out',
        pulseDot: 'pulseDot 2.2s ease-in-out infinite',
        updatePulse: 'updatePulse 900ms ease-out',
        fadeIn: 'fadeIn 200ms ease-out both',
        sheetUp: 'sheetUp 280ms cubic-bezier(0.22,1,0.36,1) both',
        slideInRight: 'slideInRight 260ms cubic-bezier(0.22,1,0.36,1) both',
      },
    },
  },
  plugins: [],
};

export default config;
