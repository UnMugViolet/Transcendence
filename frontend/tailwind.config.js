/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    "./src/**/*.{html,js,ts}",
    "./index.html"
  ],
  theme: {
    extend: {
      fontFamily: {
        'syne-mono': ['"Syne Mono"', 'monospace'],
      },
    },
  },
  plugins: [],
}

