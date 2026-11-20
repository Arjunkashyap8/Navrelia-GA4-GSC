"use client";

import { createContext, useContext, useMemo } from "react";
import {
  formatCurrency,
  formatDuration,
  formatNumber,
  formatPercent,
  formatPosition,
  type NumberSystem,
} from "@/lib/metrics/format";

/** Serializable format tokens, so server components can describe columns for client tables. */
export type Fmt = "number" | "compact" | "currency" | "currencyCompact" | "percent" | "position" | "duration" | "decimal" | "text";

const Ctx = createContext<NumberSystem>("indian");

export function NumberFormatProvider({ system, children }: { system: NumberSystem; children: React.ReactNode }) {
  return <Ctx.Provider value={system}>{children}</Ctx.Provider>;
}

export function formatWith(system: NumberSystem, v: unknown, f: Fmt): string {
  if (f === "text") return v === null || v === undefined ? "—" : String(v);
  const n = typeof v === "number" ? v : v === null || v === undefined || v === "" ? null : Number(v);
  switch (f) {
    case "number":
      return formatNumber(n, { system });
    case "compact":
      return Math.abs(n ?? 0) < 10_000 ? formatNumber(n, { system }) : formatNumber(n, { system, compact: true });
    case "currency":
      return formatCurrency(n, { system });
    case "currencyCompact":
      return Math.abs(n ?? 0) < 100_000 ? formatCurrency(n, { system }) : formatCurrency(n, { system, compact: true });
    case "percent":
      return formatPercent(n);
    case "position":
      return formatPosition(n);
    case "duration":
      return formatDuration(n);
    case "decimal":
      return formatNumber(n, { system, decimals: 2 });
  }
}

export function useFmt() {
  const system = useContext(Ctx);
  return useMemo(() => ({ system, fmt: (v: unknown, f: Fmt) => formatWith(system, v, f) }), [system]);
}
