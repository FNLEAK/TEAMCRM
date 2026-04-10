import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./src/**/*.{js,ts,jsx,tsx,mdx}"],
  theme: {
    extend: {
      fontFamily: {
        sans: ["var(--font-inter)", "ui-sans-serif", "system-ui", "sans-serif"],
        mono: ["var(--font-geist-mono)", "monospace"],
      },
      colors: {
        tactical: {
          canvas: "#000000",
          panel: "#0a0a0a",
          line: "rgba(255,255,255,0.08)",
        },
        surface: {
          DEFAULT: "#000000",
          card: "#0a0a0a",
          muted: "rgba(10, 10, 10, 0.5)",
        },
        ink: {
          DEFAULT: "#e2e8f0",
          muted: "#94a3b8",
        },
        accent: {
          DEFAULT: "#06b6d4",
          hover: "#22d3ee",
        },
        column: {
          bg: "rgba(15, 17, 28, 0.85)",
        },
      },
      boxShadow: {
        card:
          "0 0 0 1px rgba(255,255,255,0.06), inset 0 1px 0 rgba(255,255,255,0.05), 0 12px 40px -12px rgba(0,0,0,0.5)",
      },
    },
  },
  plugins: [],
};

export default config;
