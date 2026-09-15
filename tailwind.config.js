/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ["./index.html", "./src/**/*.{js,ts,jsx,tsx}"],
  plugins: [],
  theme: {
    extend: {
      fontFamily: {
        sans: ['DM Sans', 'ui-sans-serif', 'system-ui', 'sans-serif'],
        display: ['DM Serif Display', 'Georgia', 'serif'],
        'cherry-swash': ['DM Serif Display', 'Georgia', 'serif'],
        'dancing-script': ['DM Serif Display', 'Georgia', 'serif'],
      },
    },
  },
}

