/**
 * Global filters (client-safe). All live in the URL query string so any view is shareable.
 *   country  ISO-3166 alpha-2 (GA4 countryId; converted to alpha-3 for Search Console)
 *   device   desktop | mobile | tablet
 *   channel  GA4 default channel group (GA4 only)
 *   brand    brand | nonbrand (Search Console only, uses BRAND_TERMS)
 *   (page and search type are no longer user filters: always all pages, web search)
 *   state    GA4 region, e.g. "Telangana" (GA4 only; Search Console has no state data)
 *   cust     new | returning (GA4 only)
 *   view     day | week | month | quarter: how trend charts group dates (not a filter)
 */

export type Device = "desktop" | "mobile" | "tablet";
export type BrandFilter = "brand" | "nonbrand";
export type SearchType = "web" | "image" | "video" | "news" | "discover";
export type CustomerType = "new" | "returning";
export type Granularity = "day" | "week" | "month" | "quarter";

export interface DashboardFilters {
  country?: string;
  device?: Device;
  channel?: string;
  brand?: BrandFilter;
  page?: string;
  searchType: SearchType;
  state?: string;
  customer?: CustomerType;
  /** Trend grouping; defaults to "day". */
  view?: Granularity;
}

export const FILTER_KEYS = ["channel", "state", "device", "cust", "country", "brand"] as const;
export const PERIOD_KEYS = ["range", "from", "to", "cmp", "view"] as const;
export const SHARED_KEYS = [...PERIOD_KEYS, ...FILTER_KEYS] as const;

export const GRANULARITIES: { id: Granularity; label: string }[] = [
  { id: "day", label: "Day" },
  { id: "week", label: "Week" },
  { id: "month", label: "Month" },
  { id: "quarter", label: "Quarter" },
];

export const CUSTOMER_TYPES: { id: CustomerType; label: string }[] = [
  { id: "new", label: "New customers" },
  { id: "returning", label: "Returning customers" },
];

export const DEVICES: { id: Device; label: string }[] = [
  { id: "desktop", label: "Desktop" },
  { id: "mobile", label: "Mobile" },
  { id: "tablet", label: "Tablet" },
];

export const SEARCH_TYPES: { id: SearchType; label: string }[] = [
  { id: "web", label: "Web" },
  { id: "image", label: "Image" },
  { id: "video", label: "Video" },
  { id: "news", label: "News" },
  { id: "discover", label: "Discover" },
];

export const CHANNELS = [
  "Organic Search",
  "Direct",
  "Referral",
  "Organic Social",
  "Paid Search",
  "Paid Social",
  "Email",
  "Organic Shopping",
  "Paid Shopping",
  "Display",
  "Affiliates",
  "Cross-network",
  "Organic Video",
  "Paid Video",
  "SMS",
  "Mobile Push Notifications",
  "Paid Other",
  "Unassigned",
];

export function parseFilters(params: { get(k: string): string | null }): DashboardFilters {
  const device = params.get("device");
  const brand = params.get("brand");
  const country = params.get("country");
  const channel = params.get("channel")?.trim();
  const state = params.get("state")?.trim();
  const cust = params.get("cust");
  const view = params.get("view");
  return {
    country: country && /^[A-Za-z]{2}$/.test(country) ? country.toUpperCase() : undefined,
    device: DEVICES.some((d) => d.id === device) ? (device as Device) : undefined,
    channel: channel ? channel.slice(0, 80) : undefined,
    brand: brand === "brand" || brand === "nonbrand" ? brand : undefined,
    searchType: "web",
    state: state ? state.slice(0, 80) : undefined,
    customer: cust === "new" || cust === "returning" ? cust : undefined,
    view: GRANULARITIES.some((g) => g.id === view) ? (view as Granularity) : "day",
  };
}

export function activeFilterCount(f: DashboardFilters) {
  return [f.country, f.device, f.channel, f.state, f.customer, f.brand].filter(Boolean).length;
}

/** Plain-object version of URLSearchParams for server components (Next 15 searchParams). */
export type RawSearchParams = Record<string, string | string[] | undefined>;

export function toParamReader(sp: RawSearchParams) {
  return {
    get(k: string) {
      const v = sp[k];
      return Array.isArray(v) ? (v[0] ?? null) : (v ?? null);
    },
  };
}

/** Query string carrying only the shared state (for links between modules). */
export function sharedQuery(sp: RawSearchParams, extra: Record<string, string> = {}) {
  const q = new URLSearchParams();
  const r = toParamReader(sp);
  SHARED_KEYS.forEach((k) => {
    const v = r.get(k);
    if (v) q.set(k, v);
  });
  Object.entries(extra).forEach(([k, v]) => q.set(k, v));
  const s = q.toString();
  return s ? `?${s}` : "";
}
