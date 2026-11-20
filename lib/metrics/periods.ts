/**
 * Date-range + comparison math. Pure functions on ISO date strings (YYYY-MM-DD),
 * always interpreted as calendar dates in the report time zone (Asia/Calcutta).
 * Arithmetic is done in UTC on those calendar dates, so DST never shifts a day.
 */

export type RangePreset =
  | "today"
  | "yesterday"
  | "last7"
  | "last28"
  | "last90"
  | "thisMonth"
  | "lastMonth"
  | "thisQuarter"
  | "lastQuarter"
  | "ytd"
  | "last12m"
  | "last16m"
  | "custom";

export type CompareMode = "previous" | "yoy" | "none";

export interface DateRange {
  start: string;
  end: string;
}

export const RANGE_PRESETS: { id: RangePreset; label: string }[] = [
  { id: "today", label: "Today" },
  { id: "yesterday", label: "Yesterday" },
  { id: "last7", label: "Last 7 days" },
  { id: "last28", label: "Last 28 days" },
  { id: "last90", label: "Last 90 days" },
  { id: "thisMonth", label: "This month" },
  { id: "lastMonth", label: "Last month" },
  { id: "thisQuarter", label: "This quarter" },
  { id: "lastQuarter", label: "Last quarter" },
  { id: "ytd", label: "Year to date" },
  { id: "last12m", label: "Last 12 months" },
  { id: "last16m", label: "Last 16 months" },
  { id: "custom", label: "Custom range" },
];

export const COMPARE_MODES: { id: CompareMode; label: string; short: string }[] = [
  { id: "previous", label: "Previous period", short: "Prev period" },
  { id: "yoy", label: "Same period last year", short: "Last year" },
  { id: "none", label: "No comparison", short: "Off" },
];

export const DEFAULT_PRESET: RangePreset = "last28";
export const DEFAULT_COMPARE: CompareMode = "previous";

const ISO_RE = /^\d{4}-\d{2}-\d{2}$/;

export function isIsoDate(s: string | null | undefined): s is string {
  if (!s || !ISO_RE.test(s)) return false;
  const d = parseIso(s);
  return toIso(d) === s;
}

function parseIso(s: string): Date {
  const [y, m, d] = s.split("-").map(Number) as [number, number, number];
  return new Date(Date.UTC(y, m - 1, d));
}

function toIso(d: Date): string {
  return d.toISOString().slice(0, 10);
}

/** Today's calendar date in the given IANA time zone, as YYYY-MM-DD. */
export function todayInTimeZone(timeZone: string, now: Date = new Date()): string {
  // en-CA formats as YYYY-MM-DD.
  return new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(now);
}

export function addDays(iso: string, n: number): string {
  const d = parseIso(iso);
  d.setUTCDate(d.getUTCDate() + n);
  return toIso(d);
}

/** Adds calendar months, clamping to the last day of the target month (31 Mar − 1m → 28/29 Feb). */
export function addMonths(iso: string, n: number): string {
  const d = parseIso(iso);
  const day = d.getUTCDate();
  const target = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + n, 1));
  const lastDay = new Date(
    Date.UTC(target.getUTCFullYear(), target.getUTCMonth() + 1, 0),
  ).getUTCDate();
  target.setUTCDate(Math.min(day, lastDay));
  return toIso(target);
}

export function addYears(iso: string, n: number): string {
  return addMonths(iso, n * 12);
}

export function daysInclusive(range: DateRange): number {
  return Math.round((parseIso(range.end).getTime() - parseIso(range.start).getTime()) / 86_400_000) + 1;
}

function startOfMonth(iso: string): string {
  return `${iso.slice(0, 7)}-01`;
}

function endOfMonth(iso: string): string {
  return addDays(addMonths(startOfMonth(iso), 1), -1);
}

function startOfQuarter(iso: string): string {
  const d = parseIso(iso);
  const qMonth = Math.floor(d.getUTCMonth() / 3) * 3;
  return toIso(new Date(Date.UTC(d.getUTCFullYear(), qMonth, 1)));
}

/**
 * Resolve a preset to a concrete range. "Last N days" presets end yesterday (complete days),
 * matching GA4's convention. Period-to-date presets (this month, YTD…) include today.
 */
export function resolveRange(preset: RangePreset, today: string, custom?: Partial<DateRange>): DateRange {
  const yesterday = addDays(today, -1);
  switch (preset) {
    case "today":
      return { start: today, end: today };
    case "yesterday":
      return { start: yesterday, end: yesterday };
    case "last7":
      return { start: addDays(yesterday, -6), end: yesterday };
    case "last28":
      return { start: addDays(yesterday, -27), end: yesterday };
    case "last90":
      return { start: addDays(yesterday, -89), end: yesterday };
    case "thisMonth":
      return { start: startOfMonth(today), end: today };
    case "lastMonth": {
      const prev = addMonths(startOfMonth(today), -1);
      return { start: prev, end: endOfMonth(prev) };
    }
    case "thisQuarter":
      return { start: startOfQuarter(today), end: today };
    case "lastQuarter": {
      const start = addMonths(startOfQuarter(today), -3);
      return { start, end: addDays(startOfQuarter(today), -1) };
    }
    case "ytd":
      return { start: `${today.slice(0, 4)}-01-01`, end: today };
    case "last12m":
      return { start: addDays(addMonths(yesterday, -12), 1), end: yesterday };
    case "last16m":
      return { start: addDays(addMonths(yesterday, -16), 1), end: yesterday };
    case "custom": {
      const start = isIsoDate(custom?.start) ? custom.start : addDays(yesterday, -27);
      let end = isIsoDate(custom?.end) ? custom.end : yesterday;
      if (end > today) end = today;
      return start <= end ? { start, end } : { start: end, end: start };
    }
  }
}

/**
 * Comparison range.
 * - previous: the same number of days immediately before the range.
 * - yoy: the same calendar dates one year earlier (29 Feb clamps to 28 Feb).
 */
export function resolveComparison(range: DateRange, mode: CompareMode): DateRange | null {
  if (mode === "none") return null;
  if (mode === "yoy") return { start: addYears(range.start, -1), end: addYears(range.end, -1) };
  const len = daysInclusive(range);
  const end = addDays(range.start, -1);
  return { start: addDays(end, -(len - 1)), end };
}

export interface DashboardPeriod {
  preset: RangePreset;
  compare: CompareMode;
  range: DateRange;
  comparison: DateRange | null;
}

const PRESET_IDS = new Set(RANGE_PRESETS.map((p) => p.id));
const COMPARE_IDS = new Set(COMPARE_MODES.map((c) => c.id));

/** Parse the shareable URL state (?range=&from=&to=&cmp=). Unknown values fall back to defaults. */
export function parsePeriodParams(
  params: { get(name: string): string | null },
  today: string,
): DashboardPeriod {
  const rawPreset = params.get("range");
  const rawCompare = params.get("cmp");
  const preset = rawPreset && PRESET_IDS.has(rawPreset as RangePreset) ? (rawPreset as RangePreset) : DEFAULT_PRESET;
  const compare =
    rawCompare && COMPARE_IDS.has(rawCompare as CompareMode) ? (rawCompare as CompareMode) : DEFAULT_COMPARE;
  const range = resolveRange(preset, today, {
    start: params.get("from") ?? undefined,
    end: params.get("to") ?? undefined,
  });
  return { preset, compare, range, comparison: resolveComparison(range, compare) };
}

/** "18 Oct – 14 Nov 2026" (year shown once when both ends share it). */
export function formatRange(range: DateRange): string {
  const fmt = (iso: string, withYear: boolean) =>
    new Intl.DateTimeFormat("en-IN", {
      day: "numeric",
      month: "short",
      ...(withYear ? { year: "numeric" } : {}),
      timeZone: "UTC",
    }).format(parseIso(iso));
  if (range.start === range.end) return fmt(range.start, true);
  const sameYear = range.start.slice(0, 4) === range.end.slice(0, 4);
  return `${fmt(range.start, !sameYear)} – ${fmt(range.end, true)}`;
}

/** "15 Nov" */
export function formatShortDate(iso: string): string {
  return new Intl.DateTimeFormat("en-IN", { day: "numeric", month: "short", timeZone: "UTC" }).format(
    parseIso(iso),
  );
}

/** GA4 returns dates as YYYYMMDD. */
export function ga4DateToIso(d: string): string {
  return `${d.slice(0, 4)}-${d.slice(4, 6)}-${d.slice(6, 8)}`;
}
