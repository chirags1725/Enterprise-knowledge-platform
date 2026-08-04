/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{js,jsx}"],
  darkMode: "class",
  theme: {
    extend: {
      colors: {
        // Dark design system tokens
        bg: {
          DEFAULT: "#0b0f17",   // app background
          soft: "#111827",      // panels
          card: "#161d2b",      // cards
          hover: "#1d2637",     // hover state
        },
        line: "#243044",        // borders
        text: {
          DEFAULT: "#e5e9f0",   // primary text
          muted: "#9aa5b8",     // secondary text
          faint: "#5f6b80",     // tertiary text
        },
        brand: {
          DEFAULT: "#5b8cff",   // primary accent
          soft: "#2a3a63",
        },
        state: {
          queued: "#f0b429",
          processing: "#5b8cff",
          done: "#34d399",
          failed: "#f87171",
        },
      },
      fontFamily: {
        sans: ["Inter", "system-ui", "sans-serif"],
        mono: ["JetBrains Mono", "ui-monospace", "monospace"],
      },
      borderRadius: {
        xl: "0.9rem",
        "2xl": "1.25rem",
      },
    },
  },
  plugins: [],
};