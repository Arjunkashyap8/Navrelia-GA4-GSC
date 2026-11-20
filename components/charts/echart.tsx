"use client";

import dynamic from "next/dynamic";
import type { EChartsOption } from "echarts";

export { axisCommon, baseTextStyle, tooltipCommon } from "./chart-style";

/**
 * Lazy-loaded ECharts (keeps ~300 KB out of the initial bundle). The placeholder reserves the
 * exact chart height, so loading never causes layout shift.
 */
const Core = dynamic(() => import("./echart-core"), {
  ssr: false,
  loading: () => <div className="w-full animate-pulse rounded-lg bg-slate-50" style={{ height: "100%" }} aria-hidden />,
});

export function EChart(props: {
  option: EChartsOption;
  height?: number;
  label: string;
  summary?: string;
  onClick?: (params: { name?: string; seriesName?: string; data?: unknown }) => void;
}) {
  return (
    <div style={{ height: props.height ?? 280 }} className="w-full">
      <Core {...props} />
    </div>
  );
}
