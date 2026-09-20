/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        teal: {
          DEFAULT: '#0e7490',
          dark: '#115e59',
          tint: '#E0F7FA',
        },
        coral: {
          DEFAULT: '#f87171',
          tint: '#FFCDD2',
        },
        amber: {
          DEFAULT: '#f59e0b',
          tint: '#FEF3C7',
        },
        lavender: {
          DEFAULT: '#a78bfa',
          tint: '#EDE9FE',
        },
        good: {
          DEFAULT: '#10b981',
          tint: '#d1fae5'
        }
      }
    },
  },
  plugins: [],
}

