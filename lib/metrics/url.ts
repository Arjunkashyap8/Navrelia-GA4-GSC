/**
 * URL normalization for joining Search Console pages with GA4 landing pages.
 *
 * GSC reports absolute URLs ("https://www.navreliafoods.com/products/ghee?ref=x#top").
 * GA4 `landingPage` reports a path without query string ("/products/ghee").
 * Both are reduced to a canonical PATH key:
 *   1. parse as URL (paths are resolved against SITE_ORIGIN)
 *   2. drop query string and #fragment
 *   3. lowercase (host is case-insensitive; Shopify-style paths are lowercase in practice)
 *   4. decode percent-encoding where safe, collapse duplicate slashes
 *   5. strip a trailing slash except for the root "/"
 *   6. "(not set)" and empty values map to "(not set)"
 * http/https and www/non-www variants therefore join to the same key, because only the path is kept.
 */

export function normalizePath(input: string | null | undefined, origin = "https://navreliafoods.com"): string {
  if (!input) return "(not set)";
  const raw = input.trim();
  if (!raw || raw === "(not set)" || raw === "(other)") return raw || "(not set)";
  let path: string;
  try {
    path = new URL(raw, origin).pathname;
  } catch {
    path = raw.split(/[?#]/)[0] ?? raw;
  }
  try {
    path = decodeURIComponent(path);
  } catch {
    // keep encoded form
  }
  path = path.toLowerCase().replace(/\/{2,}/g, "/");
  if (path.length > 1 && path.endsWith("/")) path = path.slice(0, -1);
  return path || "/";
}

/** First directory segment for grouping: "/products/ghee" → "/products/". */
export function directoryOf(path: string): string {
  if (!path.startsWith("/")) return "(other)";
  const seg = path.split("/")[1];
  return seg ? `/${seg}/` : "/";
}

/** Apply user grouping rules ({ name, pattern } where pattern is a path prefix or /regex/). */
export function groupOf(path: string, rules: { name: string; pattern: string }[] = []): string {
  for (const r of rules) {
    const p = r.pattern.trim();
    if (!p) continue;
    if (p.startsWith("/") && p.endsWith("/") && p.length > 2 && /[\\^$*+?()[\]{}|]/.test(p)) {
      try {
        if (new RegExp(p.slice(1, -1), "i").test(path)) return r.name;
      } catch {
        continue;
      }
    } else if (path.startsWith(p.toLowerCase())) {
      return r.name;
    }
  }
  return directoryOf(path);
}
