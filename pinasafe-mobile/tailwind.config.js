/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ["./app/**/*.{js,jsx,ts,tsx}", "./components/**/*.{js,jsx,ts,tsx}"],
  presets: [require("nativewind/preset")],
  theme: {
    extend: {
      colors: {
        emergency: {
          50: '#fef2f2',
          100: '#fee2e2',
          200: '#fecaca',
          300: '#fca5a5',
          400: '#f87171',
          500: '#ef4444',
          600: '#dc2626',
          700: '#b91c1c',
          800: '#991b1b',
          900: '#7f1d1d',
        },
        safety: {
          50: '#eff6ff',
          100: '#dbeafe',
          200: '#bfdbfe',
          300: '#93c5fd',
          400: '#60a5fa',
          500: '#3b82f6',
          600: '#1d4ed8',
          700: '#1e40af',
          800: '#1e3a8a',
          900: '#1e3a8a',
        },
      },
      fontFamily: {
        quicksand: ["Quicksand-Regular", "sans-serif"],
        quicksandBold: ["Quicksand-Bold", "sans-serif"],
        quicksandSemiBold: ["Quicksand-SemiBold", "sans-serif"],
        quicksandLight: ["Quicksand-Light", "sans-serif"],
        quicksandMedium: ["Quicksand-Medium", "sans-serif"],
      },
    },
  },
  plugins: [],
};