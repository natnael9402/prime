/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    './src/pages/**/*.{js,ts,jsx,tsx,mdx}',
    './src/components/**/*.{js,ts,jsx,tsx,mdx}',
    './src/app/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  theme: {
    extend: {
      colors: {
        amazon: {
          bg: '#0f172a',
          card: '#1e293b',
          border: '#334155',
          amber: '#ff9900',
          yellow: '#febd69',
          orange: '#f3a847',
          dark: '#0f1117',
          navy: '#131921',
        },
      },
    },
  },
  plugins: [],
};
