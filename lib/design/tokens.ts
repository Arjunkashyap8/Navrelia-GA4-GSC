/**
 * Design tokens for JS consumers (charts). Mirrors tailwind.config.ts. Light mode only.
 */
export const colors = {
  canvas: "#F7F8FA",
  card: "#FFFFFF",
  line: "#E6E8EC",
  ink: "#0F172A",
  muted: "#64748B",
  brand: "#0F766E",
  positive: "#16A34A",
  negative: "#DC2626",
  warning: "#D97706",
  info: "#2563EB",
} as const;

/**
 * 8-colour categorical palette, based on Okabe–Ito (colourblind-safe), led by the brand teal.
 * Comparison periods reuse the same colour, drawn dashed at reduced opacity.
 */
export const chartPalette = [
  "#0F766E", // brand teal
  "#0072B2", // blue
  "#E69F00", // orange
  "#CC79A7", // reddish purple
  "#56B4E9", // sky blue
  "#D55E00", // vermillion
  "#7C3AED", // violet
  "#64748B", // slate
] as const;

export const comparisonStyle = { lineDash: [4, 4], opacity: 0.45 } as const;
