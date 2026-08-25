import type { Config } from "tailwindcss";

const config: Config = {
  darkMode: ["class"],
  content: [
    "./pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./components/**/*.{js,ts,jsx,tsx,mdx}",
    "./app/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        // Brand paints from CSS variables so the public site can be rethemed at
        // runtime; app/globals.css holds the amber defaults every other screen
        // keeps using.
        brand: {
          50: "#fef9ee",
          100: "rgb(var(--brand-100) / <alpha-value>)",
          200: "#f9deaa",
          300: "rgb(var(--brand-300) / <alpha-value>)",
          400: "#f0a63c",
          500: "rgb(var(--brand-500) / <alpha-value>)",
          600: "rgb(var(--brand-600) / <alpha-value>)",
          700: "rgb(var(--brand-700) / <alpha-value>)",
          800: "#924114",
          900: "rgb(var(--brand-900) / <alpha-value>)",
          950: "#401a07",
        },
        // Readable text for a brand fill. lib/themes.ts picks white or ink per
        // theme, so a pale brand colour gets dark text instead of unreadable
        // white — see onBrand() there.
        "brand-on-600": "rgb(var(--brand-on-600) / <alpha-value>)",
        "brand-on-700": "rgb(var(--brand-on-700) / <alpha-value>)",
        // The brand colour as readable type on a surface — see brandText().
        "brand-text": "rgb(var(--brand-text) / <alpha-value>)",
        // Public-site surfaces.
        page: "rgb(var(--page-bg) / <alpha-value>)",
        surface: "rgb(var(--surface) / <alpha-value>)",
        ink: "rgb(var(--ink) / <alpha-value>)",
        muted: "rgb(var(--muted) / <alpha-value>)",
        line: "rgb(var(--line) / <alpha-value>)",
        "footer-bg": "rgb(var(--footer-bg) / <alpha-value>)",
        "footer-ink": "rgb(var(--footer-ink) / <alpha-value>)",
      },
      borderRadius: {
        lg: "var(--radius)",
        md: "calc(var(--radius) - 2px)",
        sm: "calc(var(--radius) - 4px)",
      },
    },
  },
  plugins: [],
};

export default config;
