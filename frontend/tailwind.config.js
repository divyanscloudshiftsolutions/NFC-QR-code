/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ["./App.{js,jsx,ts,tsx}", "./src/**/*.{js,jsx,ts,tsx}"],
  presets: [require("nativewind/preset")],
  theme: {
    extend: {
      colors: {
        bg: 'var(--color-bg)',
        themeBg: 'var(--color-themeBg)',
        surface: 'var(--color-surface)',
        gold: 'var(--color-gold)',
        teal: 'var(--color-teal)',
        red: 'var(--color-red)',
        text: 'var(--color-text)',
        themeText: 'var(--color-themeText)',
        muted: 'var(--color-muted)',
        input: 'var(--color-input)',
        themeInput: 'var(--color-themeInput)',
        borderDark: 'var(--color-border)',
      },
    },
  },
  plugins: [],
}
