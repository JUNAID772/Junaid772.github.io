/** @type {import('tailwindcss').Config} */
export default {
  darkMode: 'class',
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        brand: {
          50: '#eef6ff',
          100: '#d9ebff',
          200: '#bcdcff',
          300: '#8ec6ff',
          400: '#59a8ff',
          500: '#2f87f8',
          600: '#1668e0',
          700: '#1252b8',
          800: '#154596',
          900: '#173c7d',
          950: '#11264c',
        },
        accent: {
          50: '#fff7ed',
          100: '#ffedd5',
          200: '#fed7aa',
          300: '#fdba74',
          400: '#fb923c',
          500: '#f97316',
          600: '#ea580c',
          700: '#c2410c',
        },
        surface: {
          light: '#f7f9fc',
          dark: '#0d1424',
          card: '#ffffff',
          cardDark: '#161f33',
        },
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', '-apple-system', 'Segoe UI', 'Roboto', 'Noto Sans', 'sans-serif'],
      },
      boxShadow: {
        card: '0 1px 2px rgba(16,24,40,.06), 0 4px 16px -4px rgba(16,24,40,.08)',
        lift: '0 8px 30px -6px rgba(16,24,40,.16)',
      },
      keyframes: {
        fadeUp: { from: { opacity: 0, transform: 'translateY(8px)' }, to: { opacity: 1, transform: 'none' } },
        sheetUp: { from: { transform: 'translateY(100%)' }, to: { transform: 'none' } },
        toastIn: { from: { opacity: 0, transform: 'translateY(12px) scale(.97)' }, to: { opacity: 1, transform: 'none' } },
      },
      animation: {
        fadeUp: 'fadeUp .35s ease both',
        sheetUp: 'sheetUp .28s cubic-bezier(.2,.8,.2,1) both',
        toastIn: 'toastIn .25s ease both',
      },
    },
  },
  plugins: [],
}
