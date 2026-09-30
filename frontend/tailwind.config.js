/** @type {import('tailwindcss').Config} */
export default {
  darkMode: ['class'],
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        ink: '#0b1714', lime: '#b9f459', mint: '#69dcac', fog: '#f3f6f1', stone: '#60706a',
      },
      fontFamily: { sans: ['DM Sans', 'sans-serif'], display: ['Manrope', 'sans-serif'] },
      boxShadow: { soft: '0 20px 60px rgba(10, 32, 24, .10)' },
    },
  },
  plugins: [],
};
