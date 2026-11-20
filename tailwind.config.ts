import type { Config } from "tailwindcss";

/**
 * Design tokens — light mode only (no dark variants by design).
 * Keep in sync with lib/design/tokens.ts (used by charts).
 */
const config: Config = {
  content: ["./app/**/*.{ts,tsx}", "./components/**/*.{ts,tsx}", "./lib/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        canvas: "#F7F8FA",
        card: "#FFFFFF",
        line: "#E6E8EC",
        ink: "#0F172A",
        muted: "#64748B",
        brand: {
          50: "#F0FDFA",
          100: "#CCFBF1",
          200: "#99F6E4",
          600: "#0D9488",
          700: "#0F766E",
          800: "#115E59",
          900: "#134E4A",
          DEFAULT: "#0F766E",
        },
        positive: { DEFAULT: "#16A34A", soft: "#F0FDF4" },
        negative: { DEFAULT: "#DC2626", soft: "#FEF2F2" },
        warning: { DEFAULT: "#D97706", soft: "#FFFBEB" },
        info: { DEFAULT: "#2563EB", soft: "#EFF6FF" },
      },
      fontFamily: {
        sans: ["var(--font-inter)", "ui-sans-serif", "system-ui", "sans-serif"],
      },
      fontSize: {
        caption: ["12px", { lineHeight: "16px" }],
        body: ["14px", { lineHeight: "20px" }],
        section: ["16px", { lineHeight: "24px", fontWeight: "600" }],
        kpi: ["30px", { lineHeight: "36px", fontWeight: "600" }],
      },
      borderRadius: {
        card: "12px",
      },
      boxShadow: {
        card: "0 1px 2px rgba(16,24,40,.05)",
      },
      maxWidth: {
        content: "1600px",
      },
    },
  },
  plugins: [],
};

export default config;
