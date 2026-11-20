/** Tiny dependency-free SVG sparkline (current solid, comparison dashed and lighter). */
export function Sparkline({
  data,
  compare,
  width = 88,
  height = 32,
  label,
}: {
  data: number[];
  compare?: number[];
  width?: number;
  height?: number;
  label: string;
}) {
  const all = [...data, ...(compare ?? [])].filter(Number.isFinite);
  const max = Math.max(...all, 1);
  const min = Math.min(...all, 0);
  const span = max - min || 1;
  const path = (series: number[]) =>
    series
      .map((v, i) => {
        const x = (i / Math.max(series.length - 1, 1)) * (width - 2) + 1;
        const y = height - 2 - ((v - min) / span) * (height - 4);
        return `${i ? "L" : "M"}${x.toFixed(1)},${y.toFixed(1)}`;
      })
      .join(" ");
  return (
    <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`} role="img" aria-label={label} className="shrink-0">
      {compare && compare.length > 1 && (
        <path d={path(compare)} fill="none" stroke="#0F766E" strokeOpacity={0.35} strokeWidth={1.25} strokeDasharray="3 3" />
      )}
      <path d={path(data)} fill="none" stroke="#0F766E" strokeWidth={1.75} strokeLinejoin="round" strokeLinecap="round" />
    </svg>
  );
}
