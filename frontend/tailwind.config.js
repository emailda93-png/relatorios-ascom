/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    "./src/**/*.{js,jsx,ts,tsx}",
    "./public/index.html"
  ],
  theme: {
    extend: {
      fontFamily: {
        'heading': ['Merriweather', 'serif'],
        'body': ['Public Sans', 'sans-serif'],
        'mono': ['JetBrains Mono', 'monospace']
      },
      colors: {
        'primary': '#000000',
        'secondary': '#ffffff',
        'surface': '#f9fafb',
        'border': '#e5e7eb'
      }
    },
  },
  plugins: [],
}
