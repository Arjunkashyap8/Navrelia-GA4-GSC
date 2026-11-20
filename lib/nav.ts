import {
  Activity,
  CalendarClock,
  FileBarChart,
  FileText,
  Gem,
  LayoutDashboard,
  MousePointerClick,
  Newspaper,
  Search,
  Settings,
  Share2,
  ShoppingBag,
  ShoppingCart,
  Users,
  type LucideIcon,
} from "lucide-react";

/** Which data source a page reads: decides the delay badge and which filters apply. */
export type DataSource = "ga4" | "gsc" | "both" | "none";

export interface NavItem {
  href: string;
  label: string;
  icon: LucideIcon;
  /** One-line purpose, shown under the page title. */
  summary: string;
  source: DataSource;
  /** Show the period + filter panel (false for pages the filters don't affect). */
  filters?: boolean;
  buildStep: number;
}

export interface NavGroup {
  label: string;
  /** Short tag shown next to the group heading. */
  tag?: string;
  items: NavItem[];
}

export const NAV: NavGroup[] = [
  {
    label: "Home",
    items: [
      { href: "/overview", label: "Executive Overview", icon: LayoutDashboard, source: "both", summary: "Business health, headline KPIs, what changed and what to do next", buildStep: 4 },
    ],
  },
  {
    label: "Google Analytics 4",
    tag: "GA4",
    items: [
      { href: "/acquisition", label: "Sessions & Sources", icon: Share2, source: "ga4", summary: "Sessions, new vs returning, sources, and add to cart → purchase by source", buildStep: 4 },
      { href: "/audience", label: "Audience & Locations", icon: Users, source: "ga4", summary: "Demography, states and cities, sources × locations, languages and devices", buildStep: 5 },
      { href: "/engagement", label: "Engagement", icon: MousePointerClick, source: "ga4", summary: "Entry pages and the key events that follow, engagement and events", buildStep: 5 },
      { href: "/conversions", label: "Ecommerce Journey", icon: ShoppingBag, source: "ga4", summary: "Store funnel by device, channel and customer type, Razorpay checkout steps by source, and products", buildStep: 4 },
      { href: "/intelligence/funnel", label: "Checkout Funnel Lab", icon: ShoppingCart, source: "ga4", summary: "Step-by-step funnel with drop-offs, next actions and value of abandoned checkouts", buildStep: 10 },
      { href: "/intelligence/patterns", label: "Buying Patterns", icon: CalendarClock, source: "ga4", summary: "When and where people browse and buy: day × hour, channel × device, product × state", buildStep: 10 },
      { href: "/realtime", label: "Realtime", icon: Activity, source: "ga4", filters: false, summary: "Active users in the last 30 minutes by page, source, location and device", buildStep: 5 },
    ],
  },
  {
    label: "Search Console",
    tag: "GSC",
    items: [
      { href: "/organic", label: "Search Keywords", icon: Search, source: "gsc", summary: "Brand and non-brand keywords, keywords with their landing pages, and core Search Console KPIs", buildStep: 4 },
      { href: "/intelligence/search-value", label: "Search Value & Topics", icon: Gem, source: "both", summary: "₹ per keyword, topic clusters, content gaps and product search demand vs sales", buildStep: 10 },
    ],
  },
  {
    label: "Combined",
    tag: "GA4 + GSC",
    items: [
      { href: "/content", label: "Content & Pages", icon: FileText, source: "both", summary: "Every landing page's search clicks, behaviour and sales; content decay", buildStep: 4 },
      { href: "/intelligence/content-commerce", label: "Content → Commerce", icon: Newspaper, source: "both", summary: "How each blog post turns search reach into product clicks and sales", buildStep: 10 },
    ],
  },
  {
    label: "Deliver",
    items: [
      { href: "/reports", label: "Reports", icon: FileBarChart, source: "both", summary: "Branded PDF report builder", buildStep: 8 },
      { href: "/settings", label: "Settings", icon: Settings, source: "none", filters: false, summary: "Connections, sync, brand terms, targets, annotations and number format", buildStep: 2 },
    ],
  },
];

export const NAV_ITEMS = NAV.flatMap((g) => g.items);

export function navItemFor(pathname: string): NavItem | undefined {
  return NAV_ITEMS.find((i) => pathname === i.href || pathname.startsWith(`${i.href}/`));
}

export const SOURCE_DELAY: Record<DataSource, string | null> = {
  ga4: "24–48h processing delay",
  gsc: "2–3 day data delay",
  both: "GA4 24–48h · GSC 2–3 day delay",
  none: null,
};
