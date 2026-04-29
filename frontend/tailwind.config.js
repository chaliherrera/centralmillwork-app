/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      colors: {
        gold: {
          50:  '#fdf8ec',
          100: '#f9edcc',
          200: '#f2d999',
          300: '#e8bf5f',
          400: '#dea832',
          500: '#9B7200',
          600: '#7d5c00',
          700: '#5f4500',
          800: '#402f00',
          900: '#201800',
        },
        forest: {
          50:  '#f0f2ee',
          100: '#d8ddd4',
          200: '#b1bba9',
          300: '#8a997e',
          400: '#637753',
          500: '#4A5240',
          600: '#3b4233',
          700: '#2c3126',
          800: '#1e211a',
          900: '#0f110d',
        },
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', 'sans-serif'],
      },
      boxShadow: {
        card: '0 1px 4px rgba(0,0,0,0.06), 0 4px 16px rgba(0,0,0,0.04)',
      },
    },
  },
  plugins: [],
}
