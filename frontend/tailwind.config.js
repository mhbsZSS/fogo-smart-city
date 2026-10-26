import typography from '@tailwindcss/typography'

/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,jsx}'],
  theme: {
    extend: {
      colors: {
        fogo: {
          950: '#05060a',
          900: '#0a0c14',
          800: '#10131d',
          700: '#181c2a',
          600: '#252b3f',
          500: '#3a4260',
        },
        ember: { 300: '#ffb27a', 400: '#ff8a3d', 500: '#ff5e1a', 600: '#e04400' },
        neon: {
          cyan: '#22e5ff',
          magenta: '#ff2bd6',
          lime: '#a3ff12',
          amber: '#ffc531',
          red: '#ff3b5c',
        },
      },
      fontFamily: {
        display: ['Orbitron', 'sans-serif'],
        sans: ['Inter', 'system-ui', 'sans-serif'],
        mono: ['"JetBrains Mono"', 'monospace'],
      },
      boxShadow: {
        neon: '0 0 18px rgba(34,229,255,.35), inset 0 0 12px rgba(34,229,255,.08)',
        ember: '0 0 24px rgba(255,94,26,.45)',
      },
      keyframes: {
        sweep: { to: { transform: 'rotate(360deg)' } },
        scan: { '0%': { transform: 'translateY(-100%)' }, '100%': { transform: 'translateY(100vh)' } },
        flicker: { '0%,100%': { opacity: 1 }, '50%': { opacity: 0.55 } },
        'fade-up': { from: { opacity: 0, transform: 'translateY(8px)' }, to: { opacity: 1, transform: 'none' } },
      },
      animation: {
        sweep: 'sweep 5s linear infinite',
        scan: 'scan 7s linear infinite',
        flicker: 'flicker 2.4s ease-in-out infinite',
        'fade-up': 'fade-up .5s ease-out both',
      },
    },
  },
  plugins: [typography],
}
