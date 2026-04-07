/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      colors: {
        orange: {
          500: '#E8631A',
          600: '#C75B12',
          700: '#8B3A00',
        }
      }
    }
  },
  plugins: [],
}
