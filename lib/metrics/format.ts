/**
 * Number formatting. Supports international (1,234,567 / 1.2M) and Indian
 * (12,34,567 / 12.3 L / 1.2 Cr) systems. Missing / non-finite values render as "—".
 */

export type NumberSystem = "international" | "indian";

export interface NumberFormatOptions {
  system?: NumberSystem;
  compact?: boolean;
  /** Max fraction digits (default 0 for plain, 1 for compact). */
  decimals?: number;
}

const DASH = "—";

function isNum(v: number | null | undefined): v is number {
  return typeof v === "number" && Number.isFinite(v);
}

function locale(system: NumberSystem) {
  return system === "indian" ? "en-IN" : "en-US";
}

function trimFixed(n: number, decimals: number): string {
  return String(Number(n.toFixed(decimals)));
}

const UNITS: Record<NumberSystem, { value: number; suffix: string }[]> = {
  indian: [
    { value: 1e7, suffix: " Cr" },
    { value: 1e5, suffix: " L" },
    { value: 1e3, suffix: "K" },
  ],
  international: [
    { value: 1e12, suffix: "T" },
    { value: 1e9, suffix: "B" },
    { value: 1e6, suffix: "M" },
    { value: 1e3, suffix: "K" },
  ],
};

function compactNumber(value: number, system: NumberSystem, decimals: number): string {
  const abs = Math.abs(value);
  const sign = value < 0 ? "-" : "";
  const units = UNITS[system];
  for (let i = 0; i < units.length; i++) {
    const unit = units[i]!;
    if (abs < unit.value) continue;
    const scaled = Number((abs / unit.value).toFixed(decimals));
    // Rounding can push a value into the next unit (99,999 → "100K" should be "1 L").
    const bigger = units[i - 1];
    if (bigger && scaled * unit.value >= bigger.value) {
      return sign + trimFixed(abs / bigger.value, decimals) + bigger.suffix;
    }
    return sign + trimFixed(scaled, decimals) + unit.suffix;
  }
  return sign + new Intl.NumberFormat(locale(system), { maximumFractionDigits: decimals }).format(abs);
}

export function formatNumber(value: number | null | undefined, opts: NumberFormatOptions = {}): string {
  if (!isNum(value)) return DASH;
  const system = opts.system ?? "international";
  if (opts.compact) return compactNumber(value, system, opts.decimals ?? 1);
  return new Intl.NumberFormat(locale(system), {
    maximumFractionDigits: opts.decimals ?? 0,
  }).format(value);
}

export function formatCurrency(
  value: number | null | undefined,
  opts: NumberFormatOptions & { currency?: string } = {},
): string {
  if (!isNum(value)) return DASH;
  const currency = opts.currency ?? "INR";
  const symbol = currency === "INR" ? "₹" : `${currency} `;
  const body = formatNumber(Math.abs(value), opts);
  return `${value < 0 ? "-" : ""}${symbol}${body}`;
}

/** `ratio` is 0–1 (e.g. 0.123 → "12.3%"). */
export function formatPercent(ratio: number | null | undefined, decimals = 1): string {
  if (!isNum(ratio)) return DASH;
  return `${(ratio * 100).toFixed(decimals)}%`;
}

export function formatPosition(position: number | null | undefined): string {
  if (!isNum(position)) return DASH;
  return position.toFixed(1);
}

/** Seconds → "1m 23s" / "45s" / "1h 02m". */
export function formatDuration(seconds: number | null | undefined): string {
  if (!isNum(seconds)) return DASH;
  const s = Math.round(seconds);
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ${String(s % 60).padStart(2, "0")}s`;
  return `${Math.floor(m / 60)}h ${String(m % 60).padStart(2, "0")}m`;
}
