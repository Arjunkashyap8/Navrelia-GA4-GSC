"use client";

import type { EChartsOption } from "echarts";
import { formatWith, useFmt, type Fmt } from "@/components/ui/fmt";
import { chartPalette, colors } from "@/lib/design/tokens";
import { axisCommon, EChart, tooltipCommon } from "./echart";

/** Horizontal or vertical (optionally stacked) bar chart for categorical breakdowns. */
export function BarChart({
  categories,
  series,
  horizontal = true,
  stacked = false,
  height,
  label,
  format = "number",
  percentStack = false,
}: {
  categories: string[];
  series: { name: string; data: number[]; color?: string }[];
  horizontal?: boolean;
  stacked?: boolean;
  height?: number;
  label: string;
  format?: Fmt;
  percentStack?: boolean;
}) {
  const { system } = useFmt();
  const h = height ?? (horizontal ? Math.max(160, categories.length * 30 + 50) : 280);
  const valueAxis = {
    type: "value" as const,
    ...axisCommon,
    max: percentStack ? 1 : undefined,
    axisLabel: { ...axisCommon.axisLabel, formatter: (v: number) => formatWith(system, v, format === "number" ? "compact" : format) },
  };
  const catAxis = {
    type: "category" as const,
    data: categories,
    inverse: horizontal,
    ...axisCommon,
    splitLine: { show: false },
    axisLabel: { ...axisCommon.axisLabel, width: horizontal ? 140 : undefined, overflow: "truncate" as const, interval: 0, rotate: horizontal ? 0 : categories.length > 8 ? 30 : 0 },
  };
  const option: EChartsOption = {
    grid: { left: 8, right: 24, top: series.length > 1 ? 32 : 8, bottom: 8, containLabel: true },
    legend: series.length > 1 ? { top: 0, left: 0, icon: "roundRect", itemWidth: 12, itemHeight: 8, textStyle: { color: colors.muted, fontSize: 11 } } : undefined,
    tooltip: {
      trigger: "axis",
      axisPointer: { type: "shadow" },
      ...tooltipCommon,
      valueFormatter: (v) => formatWith(system, v as number, format),
    },
    xAxis: horizontal ? valueAxis : catAxis,
    yAxis: horizontal ? catAxis : valueAxis,
    series: series.map((s, i) => ({
      name: s.name,
      type: "bar",
      data: s.data,
      stack: stacked ? "total" : undefined,
      barMaxWidth: 22,
      itemStyle: { color: s.color ?? chartPalette[i % chartPalette.length], borderRadius: stacked ? 0 : horizontal ? [0, 4, 4, 0] : [4, 4, 0, 0] },
    })),
  };
  return <EChart option={option} height={h} label={label} summary={`${label}. ${categories.slice(0, 5).map((c, i) => `${c}: ${formatWith(system, series[0]?.data[i], format)}`).join("; ")}`} />;
}
