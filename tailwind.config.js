/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ["./index.html", "./src/**/*.{js,ts,jsx,tsx}"],
  plugins: [],
  theme: {
    extend: {
      colors: {
        pine: { DEFAULT: '#153B35', dark: '#0F2D28' },
        ivory: '#F7F2E8',
        paper: '#FFFDF8',
        cranberry: { DEFAULT: '#A9473D', dark: '#86372F', soft: '#F8E9E6' },
        gold: { DEFAULT: '#C59A52', soft: '#F6ECD6', ink: '#7A5A1E' },
        ink: '#1C2F2B',
        body: '#3D514B',
        muted: '#66786F',
        line: '#E6DFD0',
      },
      fontFamily: {
        sans: ['DM Sans', 'ui-sans-serif', 'system-ui', 'sans-serif'],
        display: ['DM Serif Display', 'Georgia', 'serif'],
      },
      boxShadow: {
        card: '0 24px 60px -24px rgb(21 59 53 / 0.28)',
        button: '0 8px 20px -10px rgb(21 59 53 / 0.7)',
      },
    },
  },
}
