/**
 * Rule-based search intent. Order matters: navigational (brand) → transactional → commercial → informational.
 * Tuned for an Indian food/grocery brand (Hindi-English terms like "kaise", "kya", "price in india").
 */
export type Intent = "navigational" | "transactional" | "commercial" | "informational";

const TRANSACTIONAL = /\b(buy|order|price|prices|cost|rate|shop|online|discount|offer|coupon|deal|sale|delivery|cod|near me|kg|gm|gram|grams|litre|liter|ltr|ml|pack|combo|wholesale|bulk|rs|₹|amazon|flipkart|bigbasket|blinkit|zepto)\b/i;
const COMMERCIAL = /\b(best|top|review|reviews|vs|versus|compare|comparison|brand|brands|alternative|alternatives|which|quality|pure|organic|original|genuine|certified|a2)\b/i;
const INFORMATIONAL = /\b(how|what|why|when|where|who|is|are|can|does|do|recipe|recipes|benefits|uses|use|meaning|side effects|calories|nutrition|ways|guide|tips|kaise|kya|kyu|ke fayde|banane|vidhi|ingredients)\b/i;
const NAV_GENERIC = /\b(website|official|login|contact|customer care|app|store locator)\b/i;

export function classifyIntent(query: string, brandTerms: string[]): Intent {
  const q = query.toLowerCase();
  if (brandTerms.some((t) => t && q.includes(t.toLowerCase())) || NAV_GENERIC.test(q)) return "navigational";
  if (TRANSACTIONAL.test(q)) return "transactional";
  if (INFORMATIONAL.test(q) && !COMMERCIAL.test(q)) return "informational";
  if (COMMERCIAL.test(q)) return "commercial";
  return "informational";
}

export const INTENT_BADGE: Record<Intent, "info" | "positive" | "warning" | "neutral"> = {
  navigational: "neutral",
  transactional: "positive",
  commercial: "warning",
  informational: "info",
};
