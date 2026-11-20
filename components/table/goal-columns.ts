import type { Column } from "./data-table";

/**
 * Shared session → purchase columns for every GA4 breakdown table (rows built with `goalFields`).
 * `compare` adds change badges when rows carry `sessionsPrev` / `conversionRatePrev`.
 */
export function goalColumns(first: Column, opts: { compare?: boolean; extra?: Column[] } = {}): Column[] {
  return [
    first,
    { key: "sessions", label: "Sessions", format: "number", bar: true, glossary: "sessions", ...(opts.compare ? { delta: { prevKey: "sessionsPrev" } } : {}) },
    { key: "addToCarts", label: "Add to carts", format: "number" },
    { key: "cartRate", label: "Cart rate", format: "percent" },
    { key: "checkouts", label: "Checkouts", format: "number" },
    { key: "transactions", label: "Purchases", format: "number" },
    { key: "cartToPurchase", label: "Cart → purchase", format: "percent" },
    { key: "conversionRate", label: "Session → purchase", format: "percent", glossary: "conversionRate", ...(opts.compare ? { delta: { prevKey: "conversionRatePrev" } } : {}) },
    ...(opts.extra ?? []),
  ];
}
