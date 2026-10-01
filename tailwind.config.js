/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ["./index.html", "./src/**/*.{js,ts,jsx,tsx}"],
  plugins: [],
  theme: {
    extend: {
      colors: {
        pine: { DEFAULT: '#153B35', dark: '#0F2D28', soft: '#E6EFE9' },
        ivory: '#F7F2E8',
        paper: '#FFFDF8',
        cranberry: { DEFAULT: '#A9473D', dark: '#86372F', soft: '#F8E9E6' },
        gold: { DEFAULT: '#C59A52', soft: '#F6ECD6', ink: '#7A5A1E' },
        ink: '#1C2F2B',
        body: '#3D514B',
        muted: '#66786F',
        line: { DEFAULT: '#E6DFD0', strong: '#D9D1BF' },
        faint: '#A8A291',
      },
      // One type scale for the whole app: micro labels, captions, UI text, the lede and card titles.
      fontSize: {
        micro: ['12px', { lineHeight: '1.4' }],
        caption: ['13px', { lineHeight: '1.5' }],
        ui: ['15px', { lineHeight: '1.5' }],
        lede: ['17px', { lineHeight: '1.6' }],
        title: ['26px', { lineHeight: '1.15' }],
      },
      fontFamily: {
        sans: ['DM Sans', 'ui-sans-serif', 'system-ui', 'sans-serif'],
        display: ['DM Serif Display', 'Georgia', 'serif'],
      },
      borderRadius: {
        card: '18px',
        icon: '10px',
      },
      boxShadow: {
        card: '0 24px 60px -24px rgb(21 59 53 / 0.28)',
        button: '0 8px 20px -10px rgb(21 59 53 / 0.7)',
      },
    },
  },
}
