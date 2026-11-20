"use client";

import type { EChartsOption } from "echarts";
import { useDrill } from "@/components/drill/drill-context";
import { formatWith, useFmt } from "@/components/ui/fmt";
import { colors } from "@/lib/design/tokens";
import { axisCommon, EChart, tooltipCommon } from "./echart";

export interface QuadrantPoint {
  id: string;
  label: string;
  x: number; // traffic
  y: number; // conversion rate
  size: number;
}

const QUADS = [
  { name: "Stars", color: colors.positive, tint: "rgba(22,163,74,0.06)", desc: "high traffic, high conversion" },
  { name: "Fix conversion", color: colors.negative, tint: "rgba(220,38,38,0.05)", desc: "high traffic, low conversion" },
  { name: "Promote", color: colors.info, tint: "rgba(37,99,235,0.05)", desc: "low traffic, high conversion" },
  { name: "Review", color: colors.muted, tint: "rgba(100,116,139,0.04)", desc: "low traffic, low conversion" },
];

export function quadrantOf(p: { x: number; y: number }, xMid: number, yMid: number) {
  if (p.x >= xMid) return p.y >= yMid ? 0 : 1;
  return p.y >= yMid ? 2 : 3;
}

const NICE_RATES = [0.005, 0.01, 0.02, 0.03, 0.04, 0.05, 0.08, 0.1, 0.15, 0.2, 0.3, 0.5, 1];
const niceRate = (v: number) => NICE_RATES.find((n) => n >= v) ?? 1;

/** Last meaningful URL segment, shortened: "/products/ruby-roti-atta/" → "ruby-roti-atta". */
function shortLabel(path: string) {
  const seg = path.split("?")[0]!.split("/").filter(Boolean).pop();
  if (!seg) return "Home page";
  const s = seg;
  return s.length > 24 ? `${s.slice(0, 23)}…` : s;
}

/**
 * Traffic (log x) vs conversion rate, split into four shaded quadrants at the median traffic and
 * the site conversion rate. A single high-converting page with few sessions would otherwise squash
 * every other point onto the 0% line, so the y axis is capped and those few points sit on the top
 * edge as triangles (the tooltip shows the real rate). The busiest pages are labelled.
 */
export function QuadrantChart({ points, xMid, yMid, label, drillType = "page" }: { points: QuadrantPoint[]; xMid: number; yMid: number; label: string; drillType?: "page" | null }) {
  const { system } = useFmt();
  const { open } = useDrill();

  const xs = points.map((p) => Math.max(p.x, 1));
  const xMin = Math.pow(10, Math.floor(Math.log10(Math.min(...xs, Math.max(xMid, 1)))));
  const xMax = Math.pow(10, Math.ceil(Math.log10(Math.max(...xs, 10))));

  const ys = [...points.map((p) => p.y)].sort((a, b) => a - b);
  const maxY = ys.at(-1) ?? 0;
  const p85 = ys[Math.floor(ys.length * 0.85)] ?? 0;
  const ref = Math.max(p85 * 1.5, yMid * 3, 0.01);
  const capped = maxY > ref * 1.5;
  const yMax = niceRate(capped ? ref : Math.max(maxY * 1.15, yMid * 2, 0.01));

  const labelled = new Set([...points].sort((a, b) => b.x - a.x).slice(0, 6).map((p) => p.id));
  points.filter((p) => p.y >= yMax).forEach((p) => labelled.add(p.id));

  const sizes = points.map((p) => p.size || 0);
  const maxSize = Math.max(...sizes, 1);
  const symbolSize = (s: number) => 9 + Math.sqrt(s / maxSize) * 13;

  const corner = (name: string, color: string, position: "insideTopRight" | "insideBottomRight" | "insideTopLeft" | "insideBottomLeft") => ({
    name,
    label: { show: true, position, color, fontSize: 11, fontWeight: 600 as const, opacity: 0.85 },
  });

  const option: EChartsOption = {
    grid: { left: 8, right: 28, top: 40, bottom: 36, containLabel: true },
    legend: { top: 0, right: 0, itemWidth: 10, itemHeight: 10, icon: "circle", textStyle: { color: colors.muted, fontSize: 12 } },
    tooltip: {
      ...tooltipCommon,
      formatter: (p: unknown) => {
        const d = (p as { data?: { name: string; real?: number[] } }).data;
        if (!d?.real) return "";
        return `<b>${d.name}</b><br/>Sessions: ${formatWith(system, d.real[0], "number")}<br/>Conversion rate: ${formatWith(system, d.real[1], "percent")}`;
      },
    },
    xAxis: { type: "log", min: xMin, max: xMax, name: "Sessions (log scale)", nameLocation: "middle", nameGap: 28, nameTextStyle: { color: colors.muted, fontSize: 11 }, ...axisCommon },
    yAxis: {
      type: "value",
      min: 0,
      max: yMax,
      name: capped ? "Conversion rate (capped)" : "Conversion rate",
      nameTextStyle: { color: colors.muted, fontSize: 11, align: "left" },
      ...axisCommon,
      axisLabel: { ...axisCommon.axisLabel, formatter: (v: number) => `${+(v * 100).toFixed(1)}%` },
    },
    series: [
      ...QUADS.map((q, qi) => ({
        name: q.name,
        type: "scatter" as const,
        itemStyle: { color: q.color, opacity: 0.8, borderColor: "#fff", borderWidth: 1 },
        emphasis: { focus: "self" as const, label: { show: true } },
        labelLayout: { hideOverlap: true },
        data: points
          .filter((p) => quadrantOf(p, xMid, yMid) === qi)
          .map((p) => {
            const over = p.y > yMax;
            return {
              name: p.label,
              id: p.id,
              real: [p.x, p.y],
              value: [Math.max(p.x, 1), over ? yMax : p.y],
              symbol: over ? "triangle" : "circle",
              symbolSize: symbolSize(p.size || 0),
              label: {
                show: labelled.has(p.id),
                formatter: over ? `${shortLabel(p.label)} (${formatWith(system, p.y, "percent")})` : shortLabel(p.label),
                position: over ? ("bottom" as const) : ("top" as const),
                color: colors.ink,
                fontSize: 11,
              },
            };
          }),
      })),
      {
        // Quadrant shading, split lines and corner names.
        name: "quadrants",
        type: "scatter" as const,
        data: [],
        silent: true,
        markArea: {
          silent: true,
          data: [
            [{ ...corner("Stars", QUADS[0]!.color, "insideTopRight"), xAxis: xMid, yAxis: yMid, itemStyle: { color: QUADS[0]!.tint } }, { xAxis: xMax, yAxis: yMax }],
            [{ ...corner("Fix conversion", QUADS[1]!.color, "insideBottomRight"), xAxis: xMid, yAxis: 0, itemStyle: { color: QUADS[1]!.tint } }, { xAxis: xMax, yAxis: yMid }],
            [{ ...corner("Promote", QUADS[2]!.color, "insideTopLeft"), xAxis: xMin, yAxis: yMid, itemStyle: { color: QUADS[2]!.tint } }, { xAxis: xMid, yAxis: yMax }],
            [{ ...corner("Review", QUADS[3]!.color, "insideBottomLeft"), xAxis: xMin, yAxis: 0, itemStyle: { color: QUADS[3]!.tint } }, { xAxis: xMid, yAxis: yMid }],
          ],
        },
        markLine: {
          silent: true,
          symbol: "none",
          // Default precision is 2 decimals, which would draw a 0.6% line at 1%.
          precision: 8,
          lineStyle: { type: "dashed", color: "#94A3B8", width: 1 },
          label: { color: colors.muted, fontSize: 10 },
          data: [
            { xAxis: Math.max(xMid, 1), label: { formatter: `median ${formatWith(system, xMid, "number")} sessions`, position: "end" } },
            { yAxis: yMid, label: { formatter: `site ${formatWith(system, yMid, "percent")}`, position: "insideEndTop" } },
          ],
        },
      },
    ],
  };
  // Keep the helper series out of the legend.
  (option.legend as { data?: string[] }).data = QUADS.map((q) => q.name);

  return (
    <EChart
      option={option}
      height={440}
      label={label}
      summary={QUADS.map((q, qi) => `${q.name} (${q.desc}): ${points.filter((p) => quadrantOf(p, xMid, yMid) === qi).length} pages`).join(". ")}
      onClick={
        drillType
          ? (p) => {
              const id = (p.data as { id?: string })?.id;
              if (id) open({ type: drillType, id });
            }
          : undefined
      }
    />
  );
}
