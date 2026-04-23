/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,jsx}'],
  theme: {
    extend: {
      colors: {
        brand: {
          dark:   '#1C2B1E',
          mid:    '#2D4A31',
          light:  '#4A7C59',
          gold:   '#C9943A',
          cream:  '#F5F0E8',
          sand:   '#E8DCC8',
        }
      },
      fontFamily: {
        display: ['"Playfair Display"', 'Georgia', 'serif'],
        body:    ['"DM Sans"', 'system-ui', 'sans-serif'],
        mono:    ['"JetBrains Mono"', 'monospace'],
      }
    },
  },
  plugins: [],
}
