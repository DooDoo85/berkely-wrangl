/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,jsx}'],
  theme: {
    extend: {
      colors: {
        // ═══════════════════════════════════════════════════════════════
        // Wrangl design system — premium manufacturing software
        // ═══════════════════════════════════════════════════════════════

        // Surface neutrals — page, card, sidebar backgrounds
        surface: {
          darker:  '#1a0f08',  // sidebar top
          deep:    '#2a1d10',  // sidebar bottom, primary text
          cream:   '#ede5d4',  // page bg (executive)
          paper:   '#f5f0e6',  // page bg (operational)
          clean:   '#fafaf7',  // page bg (utility)
          card:    '#f7f0e0',  // card bg (executive)
          'card-op': '#ffffff', // card bg (operational, utility)
          border:  '#d9cab2',  // card border (executive)
          'border-op': '#e5e0d4', // card border (operational, utility)
        },

        // Ink — text colors
        ink: {
          strong: '#2a1d10',  // primary text, headings
          mid:    '#6b5640',  // secondary text
          muted:  '#a08868',  // labels, captions, section headers
          inverse:'#f7f0e0',  // text on dark surfaces
        },

        // Brand accents (earthy, not decorative)
        accent: {
          clay:   '#b85d3a',  // primary brand (roller, key actions)
          'clay-hover': '#a04e2e',
          'clay-soft':  '#f0d8c8',  // tinted bg for clay accents
          gold:   '#d4a574',  // secondary brand (faux, callouts)
          'gold-hover': '#c09060',
          'gold-soft':  '#f5e8d4',
        },

        // Semantic status colors — earthy/oxidized, not candy bright
        status: {
          healthy:        '#5b8c5a',
          'healthy-soft': '#dfeadb',
          warning:        '#c2913a',
          'warning-soft': '#f7e8c6',
          critical:       '#b54a3a',   // oxidized red-clay
          'critical-soft':'#f3d6cd',
          info:           '#4a6b8c',
          'info-soft':    '#d8e0eb',
        },

        // ═══════════════════════════════════════════════════════════════
        // Legacy `brand` palette — kept for backwards compatibility while
        // we sweep pages. Maps to new tokens. Remove once sweep is done.
        // ═══════════════════════════════════════════════════════════════
        brand: {
          dark:   '#2a1d10',
          mid:    '#6b5640',
          light:  '#a08868',
          gold:   '#b85d3a',   // clay primary
          cream:  '#ede5d4',
          sand:   '#d9cab2',
        }
      },

      fontFamily: {
        // Merriweather only at H1/H2 — voice/heading moments
        display: ['"Merriweather"', 'Georgia', 'serif'],
        // Inter everywhere else — UI, body, tables
        body:    ['"Inter"', 'system-ui', 'sans-serif'],
        sans:    ['"Inter"', 'system-ui', 'sans-serif'],
        mono:    ['"JetBrains Mono"', 'ui-monospace', 'monospace'],
      },

      fontSize: {
        // Tightened scale for consistent rhythm
        'xxs': ['10px', { lineHeight: '14px', letterSpacing: '0.05em' }],
      },

      borderRadius: {
        DEFAULT: '8px',
        'card': '12px',
        'pill': '9999px',
      },

      boxShadow: {
        'card-exec':       '0 1px 3px rgba(42,29,16,0.06), 0 0 0 1px rgba(217,202,178,0.4)',
        'card-op':         '0 1px 2px rgba(42,29,16,0.04)',
        'card-hover':      '0 4px 12px rgba(42,29,16,0.08)',
      },

      spacing: {
        // Standard 4-based rhythm; no arbitrary values
      },
    },
  },
  plugins: [],
}
