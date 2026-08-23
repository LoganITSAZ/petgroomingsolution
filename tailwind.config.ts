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
        brand: {
          50:  "#fef9ee",
          100: "#fdf0d5",
          200: "#f9deaa",
          300: "#f5c674",
          400: "#f0a63c",
          500: "#ec8b1a",
          600: "#dd7010",
          700: "#b75310",
          800: "#924114",
          900: "#763714",
          950: "#401a07",
        },
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
