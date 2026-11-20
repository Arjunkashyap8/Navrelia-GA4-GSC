import { colors } from "@/lib/design/tokens";

export const baseTextStyle = { fontFamily: "Inter, ui-sans-serif, system-ui", color: colors.muted, fontSize: 11 };

export const axisCommon = {
  axisLine: { lineStyle: { color: colors.line } },
  axisTick: { show: false },
  axisLabel: { color: colors.muted, fontSize: 11 },
  splitLine: { lineStyle: { color: "#EEF0F3" } },
};

export const tooltipCommon = {
  backgroundColor: "#FFFFFF",
  borderColor: colors.line,
  textStyle: { color: colors.ink, fontSize: 12 },
  extraCssText: "box-shadow:0 4px 12px rgba(16,24,40,.08);border-radius:8px;",
};
