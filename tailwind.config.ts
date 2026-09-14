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
      fontFamily: {
        // Set in app/layout.tsx. The stack behind it matters: the face is
        // fetched, and a shop terminal on a bad connection still has to be
        // readable while it arrives.
        // Headlines, page titles and the kiosk. Reading-size text never uses
        // it — see the note in app/layout.tsx.
        display: [
          "var(--font-display)",
          "var(--font-sans)",
          "ui-sans-serif",
          "system-ui",
          "sans-serif",
        ],
        sans: [
          "var(--font-sans)",
          "ui-sans-serif",
          "system-ui",
          "-apple-system",
          "Segoe UI",
          "sans-serif",
        ],
      },
      boxShadow: {
        // One soft, close shadow rather than a scale nobody would use. It
        // lifts the page card off the background so the card edge stops
        // depending entirely on a hairline.
        card: "0 1px 2px rgb(28 25 23 / 0.04), 0 4px 16px -8px rgb(28 25 23 / 0.10)",
      },
      colors: {
        // Website and dashboard share runtime brand variables; globals.css
        // supplies the fallback palette before a shell applies its theme.
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
        // Back-office surfaces. A page is a white card; a well is the inset a
        // list or a summary sits in, and a band is a toolbar/summary strip
        // across the card. Both are tokens rather than `bg-stone-50/60`, so
        // "make the wells a shade darker" is one edit instead of thirty, and
        // dark mode overrides one class instead of an opacity-variant regex.
        well: "rgb(var(--well) / <alpha-value>)",
        band: "rgb(var(--band) / <alpha-value>)",
        "well-line": "rgb(var(--well-line) / <alpha-value>)",
        // Signals — act / finished / shut. Never brand-derived; see globals.css.
        "signal-alert": "rgb(var(--signal-alert) / <alpha-value>)",
        "signal-open": "rgb(var(--signal-open) / <alpha-value>)",
        "signal-shut": "rgb(var(--signal-shut) / <alpha-value>)",
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
