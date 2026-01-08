/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    "./src/**/*.{html,js,ts}",
    "./index.html"
  ],
  safelist: [
    'text-green-400',
    'text-red-400',
    'text-amber-300',
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

