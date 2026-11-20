"use client";

import type { EChartsOption } from "echarts";
import { formatWith, useFmt, type Fmt } from "@/components/ui/fmt";
import { colors } from "@/lib/design/tokens";
import { axisCommon, EChart, tooltipCommon } from "./echart";

/**
 * Two-dimensional heatmap (e.g. day-of-week × hour). Sequential teal scale, value labels in the
 * tooltip, and a visually-hidden summary of the hottest cells for screen readers.
 */
export function Heatmap({
  x,
  y,
  values,
  label,
  format = "number",
  height,
}: {
  x: string[];
  y: string[];
  /** values[yIndex][xIndex] */
  values: (number | null)[][];
  label: string;
  format?: Fmt;
  height?: number;
}) {
  const { system } = useFmt();
  const data: [number, number, number | null][] = [];
  values.forEach((row, yi) => row.forEach((v, xi) => data.push([xi, yi, v])));
  const nums = data.map((d) => d[2]).filter((v): v is number => v !== null);
  // Cap the colour scale at the 95th percentile so a single spike doesn't wash out the rest.
  const sortedNums = [...nums].sort((a, b) => a - b);
  const max = sortedNums.length ? sortedNums[Math.min(sortedNums.length - 1, Math.floor(sortedNums.length * 0.95))]! : 0;
  const top = [...data].filter((d) => d[2] !== null).sort((a, b) => (b[2] ?? 0) - (a[2] ?? 0)).slice(0, 3);
  const option: EChartsOption = {
    grid: { left: 8, right: 16, top: 8, bottom: 48, containLabel: true },
    tooltip: {
      ...tooltipCommon,
      formatter: (p: unknown) => {
        const d = (p as { data: [number, number, number | null] }).data;
        return `<b>${y[d[1]]} · ${x[d[0]]}</b><br/>${formatWith(system, d[2], format)}`;
      },
    },
    xAxis: { type: "category", data: x, ...axisCommon, splitArea: { show: false }, axisLabel: { ...axisCommon.axisLabel, interval: 0, fontSize: 10 } },
    yAxis: { type: "category", data: y, inverse: true, ...axisCommon, splitArea: { show: false } },
    visualMap: {
      min: 0,
      max: max || 1,
      calculable: false,
      orient: "horizontal",
      left: "center",
      bottom: 0,
      itemHeight: 140,
      itemWidth: 10,
      textStyle: { color: colors.muted, fontSize: 10 },
      inRange: { color: ["#F0FDFA", "#99F6E4", "#0D9488", "#134E4A"] },
      formatter: (v: unknown) => formatWith(system, Number(v), format === "number" ? "compact" : format),
    },
    series: [{ type: "heatmap", data, itemStyle: { borderColor: "#fff", borderWidth: 1, borderRadius: 2 }, emphasis: { itemStyle: { borderColor: colors.ink } } }],
  };
  return (
    <EChart
      option={option}
      height={height ?? Math.max(220, y.length * 30 + 70)}
      label={label}
      summary={`${label}. Highest: ${top.map((t) => `${y[t[1]]} ${x[t[0]]} (${formatWith(system, t[2], format)})`).join("; ")}.`}
    />
  );
}
