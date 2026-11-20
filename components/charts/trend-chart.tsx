"use client";

import type { EChartsOption, SeriesOption } from "echarts";
import { formatWith, useFmt, type Fmt } from "@/components/ui/fmt";
import { chartPalette, colors } from "@/lib/design/tokens";
import { formatShortDate } from "@/lib/metrics/periods";
import { axisCommon, EChart, tooltipCommon } from "./echart";

export interface TrendSeries {
  name: string;
  data: (number | null)[];
  /** Comparison-period values aligned by index (drawn dashed and lighter in the same colour). */
  compare?: (number | null)[];
  axis?: 0 | 1;
  type?: "line" | "bar";
  format?: Fmt;
  color?: string;
  stack?: string;
  area?: boolean;
}

export interface ChartAnnotation {
  date: string;
  title: string;
  category: string;
}

/**
 * Time-series chart: current period solid, comparison dashed in the same colour,
 * annotations as dotted vertical markers with a tooltip label, optional second axis.
 */
export function TrendChart({
  dates,
  series,
  annotations = [],
  height = 300,
  label,
  preliminaryFrom,
  categorical = false,
}: {
  dates: string[];
  series: TrendSeries[];
  annotations?: ChartAnnotation[];
  height?: number;
  label: string;
  /** Dates ≥ this are shaded as preliminary (e.g. Search Console's freshest days). */
  preliminaryFrom?: string | null;
  /** x values are labels, not ISO dates. */
  categorical?: boolean;
}) {
  const { system } = useFmt();
  // Dates may be days or week/month/quarter bucket starts ("View by"); detect from the spacing.
  const gran = categorical ? "day" : detectGranularity(dates);
  const fmtX = (d: string) => {
    if (categorical) return d;
    if (gran === "month") return new Intl.DateTimeFormat("en-IN", { month: "short", year: "numeric", timeZone: "UTC" }).format(new Date(`${d}T00:00:00Z`));
    if (gran === "quarter") return `Q${Math.floor(Number(d.slice(5, 7)) / 3) + 1} ${d.slice(0, 4)}`;
    return gran === "week" ? `w/c ${formatShortDate(d)}` : formatShortDate(d);
  };
  /** The bucket (date label) a day falls into: the last label on or before it. */
  const bucketOf = (day: string) => {
    if (categorical || !dates.length || day < dates[0]!) return null;
    let hit: string | null = null;
    for (const d of dates) if (d <= day) hit = d;
    return hit;
  };
  const annBuckets = annotations.map((a) => ({ ...a, bucket: gran === "day" ? (dates.includes(a.date) ? a.date : null) : bucketOf(a.date) })).filter((a) => a.bucket);
  const prelimBucket = preliminaryFrom ? (gran === "day" ? dates.find((d) => d >= preliminaryFrom) : bucketOf(preliminaryFrom)) : undefined;
  const axes = [...new Set(series.map((s) => s.axis ?? 0))];
  const fmtOf = (axis: number) => series.find((s) => (s.axis ?? 0) === axis)?.format ?? "number";

  const out: SeriesOption[] = [];
  series.forEach((s, i) => {
    const color = s.color ?? chartPalette[i % chartPalette.length];
    out.push({
      name: s.name,
      type: s.type ?? "line",
      data: s.data,
      yAxisIndex: s.axis ?? 0,
      stack: s.stack,
      smooth: false,
      showSymbol: dates.length < 20,
      symbolSize: 5,
      itemStyle: { color },
      lineStyle: { width: 2, color },
      areaStyle: s.area ? { opacity: s.stack ? 0.85 : 0.12, color } : undefined,
      barMaxWidth: 18,
      emphasis: { focus: "series" },
      ...(i === 0 && annotations.length
        ? {
            markLine: {
              symbol: "none",
              silent: false,
              label: { show: false },
              lineStyle: { type: "dotted", color: colors.warning, width: 1.25 },
              data: annBuckets.map((a) => ({ xAxis: fmtX(a.bucket!), name: a.title })),
              tooltip: { show: true, formatter: (p: { name?: string }) => `📌 ${p.name ?? ""}` },
            },
          }
        : {}),
      ...(i === 0 && prelimBucket
        ? {
            markArea: {
              silent: true,
              itemStyle: { color: "rgba(217,119,6,0.06)" },
              label: { show: true, position: "insideTop", color: colors.warning, fontSize: 10, formatter: "preliminary" },
              data: [[{ xAxis: fmtX(prelimBucket) }, { xAxis: fmtX(dates[dates.length - 1]!) }]],
            },
          }
        : {}),
    } as SeriesOption);
    if (s.compare) {
      out.push({
        name: `${s.name} (comparison)`,
        type: "line",
        data: s.compare,
        yAxisIndex: s.axis ?? 0,
        showSymbol: false,
        lineStyle: { width: 1.5, type: "dashed", color, opacity: 0.45 },
        itemStyle: { color, opacity: 0.45 },
        emphasis: { disabled: true },
        z: 1,
      });
    }
  });

  const option: EChartsOption = {
    grid: { left: 8, right: axes.length > 1 ? 8 : 16, top: 36, bottom: 8, containLabel: true },
    legend: { top: 0, left: 0, icon: "roundRect", itemWidth: 12, itemHeight: 4, textStyle: { color: colors.muted, fontSize: 11 } },
    tooltip: {
      trigger: "axis",
      ...tooltipCommon,
      valueFormatter: undefined,
      formatter: (params: unknown) => {
        const ps = params as { seriesName: string; value: number | null; color: string; axisValueLabel: string; dataIndex: number }[];
        if (!ps.length) return "";
        const idx = ps[0]!.dataIndex;
        const head = `<div style="font-weight:600;margin-bottom:4px">${ps[0]!.axisValueLabel}</div>`;
        const lines = ps.map((p) => {
          const base = series.find((s) => p.seriesName === s.name || p.seriesName === `${s.name} (comparison)`);
          const v = formatWith(system, p.value, base?.format ?? "number");
          return `<div style="display:flex;gap:8px;justify-content:space-between"><span><span style="display:inline-block;width:8px;height:8px;border-radius:2px;background:${p.color};margin-right:6px"></span>${p.seriesName}</span><b style="font-variant-numeric:tabular-nums">${v}</b></div>`;
        });
        const ann = annBuckets.filter((a) => a.bucket === dates[idx]).map((a) => `<div style="margin-top:4px;color:${colors.warning}">📌 ${a.title}</div>`);
        return head + lines.join("") + ann.join("");
      },
    },
    xAxis: { type: "category", data: dates.map(fmtX), boundaryGap: series.some((s) => s.type === "bar"), ...axisCommon, splitLine: { show: false } },
    yAxis: axes.map((a) => ({
      type: "value" as const,
      ...axisCommon,
      splitLine: a === 0 ? axisCommon.splitLine : { show: false },
      axisLabel: { ...axisCommon.axisLabel, formatter: (v: number) => formatWith(system, v, fmtOf(a) === "number" ? "compact" : fmtOf(a)) },
      min: fmtOf(a) === "position" ? 1 : undefined,
      inverse: fmtOf(a) === "position",
    })),
    series: out,
  };

  return <EChart option={option} height={height} label={label} summary={`${label}: ${series.map((s) => s.name).join(", ")} over ${dates.length} points.`} />;
}

/** Infer day / week / month / quarter from the median gap between consecutive ISO dates. */
function detectGranularity(dates: string[]): "day" | "week" | "month" | "quarter" {
  if (dates.length < 2 || !/^\d{4}-\d{2}-\d{2}$/.test(dates[0]!)) return "day";
  const gaps = dates
    .slice(1)
    .map((d, i) => (Date.parse(`${d}T00:00:00Z`) - Date.parse(`${dates[i]}T00:00:00Z`)) / 86_400_000)
    .sort((a, b) => a - b);
  const g = gaps[Math.floor(gaps.length / 2)]!;
  return g >= 80 ? "quarter" : g >= 27 ? "month" : g >= 6 ? "week" : "day";
}
