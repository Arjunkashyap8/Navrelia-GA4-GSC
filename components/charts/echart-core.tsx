"use client";

import { BarChart, HeatmapChart, LineChart, ScatterChart } from "echarts/charts";
import {
  DataZoomComponent,
  GridComponent,
  LegendComponent,
  MarkAreaComponent,
  MarkLineComponent,
  TooltipComponent,
  VisualMapComponent,
} from "echarts/components";
import * as echarts from "echarts/core";
import { LabelLayout } from "echarts/features";
import { SVGRenderer } from "echarts/renderers";
import ReactEChartsCore from "echarts-for-react/lib/core";
import type { EChartsOption } from "echarts";
import { baseTextStyle } from "./chart-style";

echarts.use([
  LineChart,
  BarChart,
  ScatterChart,
  HeatmapChart,
  VisualMapComponent,
  GridComponent,
  TooltipComponent,
  LegendComponent,
  MarkLineComponent,
  MarkAreaComponent,
  DataZoomComponent,
  LabelLayout,
  SVGRenderer,
]);

/**
 * ECharts wrapper. SVG renderer (crisp in PDF), fixed height so charts never cause layout shift,
 * and an aria-label + visually-hidden summary for screen readers.
 */
export default function EChartCore({
  option,
  height = 280,
  label,
  summary,
  onClick,
}: {
  option: EChartsOption;
  height?: number;
  label: string;
  summary?: string;
  onClick?: (params: { name?: string; seriesName?: string; data?: unknown }) => void;
}) {
  return (
    <figure role="img" aria-label={label} style={{ height }} className="relative w-full">
      <ReactEChartsCore
        echarts={echarts}
        option={{ textStyle: baseTextStyle, animationDuration: 300, ...option }}
        style={{ height, width: "100%" }}
        opts={{ renderer: "svg" }}
        notMerge
        lazyUpdate
        onEvents={onClick ? { click: onClick } : undefined}
      />
      {summary && <figcaption className="sr-only">{summary}</figcaption>}
    </figure>
  );
}
