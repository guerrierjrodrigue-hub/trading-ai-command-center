import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        // Dark, finance-oriented palette. Neutral surfaces + a violet/cyan accent.
        bg: {
          DEFAULT: "#0a0b0f",
          soft: "#0f1117",
          card: "#141722",
          hover: "#1a1e2b",
        },
        border: {
          DEFAULT: "#232838",
          soft: "#1b2030",
        },
        accent: {
          DEFAULT: "#7c5cff",
          soft: "#9d86ff",
          dim: "#5a3fd6",
        },
        cyan: "#22d3ee",
        pos: "#22c55e",
        neg: "#f43f5e",
        warn: "#f59e0b",
        muted: "#8b93a7",
        faint: "#5a6178",
      },
      fontFamily: {
        sans: ["var(--font-sans)", "ui-sans-serif", "system-ui", "sans-serif"],
        mono: ["ui-monospace", "SFMono-Regular", "Menlo", "monospace"],
      },
      boxShadow: {
        glow: "0 0 0 1px rgba(124,92,255,0.25), 0 8px 40px -12px rgba(124,92,255,0.35)",
        card: "0 1px 0 0 rgba(255,255,255,0.03) inset, 0 8px 30px -18px rgba(0,0,0,0.9)",
      },
      keyframes: {
        "fade-in": {
          "0%": { opacity: "0", transform: "translateY(4px)" },
          "100%": { opacity: "1", transform: "translateY(0)" },
        },
        shimmer: {
          "100%": { transform: "translateX(100%)" },
        },
      },
      animation: {
        "fade-in": "fade-in 0.35s ease-out both",
        shimmer: "shimmer 1.6s infinite",
      },
    },
  },
  plugins: [],
};

export default config;
