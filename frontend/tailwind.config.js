/** @type {import('tailwindcss').Config} */
module.exports = {
  darkMode: ["class"],
  content: [
    './pages/**/*.{ts,tsx}',
    './components/**/*.{ts,tsx}',
    './app/**/*.{ts,tsx}',
    './src/**/*.{ts,tsx}',
  ],
  theme: {
    container: {
      center: true,
      padding: "2rem",
      screens: {
        "2xl": "1400px",
      },
    },
    extend: {
      colors: {
        /* Rootly Brand - Purple (STRUCTURAL) */
        purple: {
          900: '#3F357A',  // Dark surfaces, nav bars
          800: '#5B4DB0',  // Headers, selected states
          700: '#7C63D6',  // ⭐ MAIN - CTAs, links, active UI
          500: '#9C84E8',  // Secondary buttons, hover
          300: '#DCD4FA',  // Card backgrounds
          200: '#ECE7FF',  // Section backgrounds
          100: '#F6F3FF',  // Page background
          25: '#fefcff',
        },

        /* Rootly Brand - Orange (ACCENT ONLY) */
        orange: {
          900: '#F0883E',  // Destructive, critical alerts
          700: '#FFA857',  // Secondary emphasis, badges
          500: '#FFC387',  // Soft highlights
        },

        /* Neutral System - Readability */
        neutral: {
          900: '#1E1E26',  // Primary text
          700: '#4A4A57',  // Secondary text
          500: '#A0A0A8',  // Muted text
          300: '#D6D6DB',  // Borders/dividers
          200: '#EFEFF2',  // Subtle surfaces
          100: '#F7F7F9',  // Default background
        },

        border: "hsl(var(--border))",
        input: "hsl(var(--input))",
        ring: "hsl(var(--ring))",
        background: "hsl(var(--background))",
        foreground: "hsl(var(--foreground))",
        primary: {
          DEFAULT: "hsl(var(--primary))",
          foreground: "hsl(var(--primary-foreground))",
        },
        secondary: {
          DEFAULT: "hsl(var(--secondary))",
          foreground: "hsl(var(--secondary-foreground))",
        },
        destructive: {
          DEFAULT: "hsl(var(--destructive))",
          foreground: "hsl(var(--destructive-foreground))",
        },
        muted: {
          DEFAULT: "hsl(var(--muted))",
          foreground: "hsl(var(--muted-foreground))",
        },
        accent: {
          DEFAULT: "hsl(var(--accent))",
          foreground: "hsl(var(--accent-foreground))",
        },
        popover: {
          DEFAULT: "hsl(var(--popover))",
          foreground: "hsl(var(--popover-foreground))",
        },
        card: {
          DEFAULT: "hsl(var(--card))",
          foreground: "hsl(var(--card-foreground))",
        },
      },
      borderRadius: {
        lg: "var(--radius)",
        md: "calc(var(--radius) - 2px)",
        sm: "calc(var(--radius) - 4px)",
      },
      keyframes: {
        "accordion-down": {
          from: { height: 0 },
          to: { height: "var(--radix-accordion-content-height)" },
        },
        "accordion-up": {
          from: { height: "var(--radix-accordion-content-height)" },
          to: { height: 0 },
        },
      },
      animation: {
        "accordion-down": "accordion-down 0.2s ease-out",
        "accordion-up": "accordion-up 0.2s ease-out",
      },
    },
  },
  plugins: [require("tailwindcss-animate")],
}