/** Plain-English metric definitions + formulas, shown in every metric's info tooltip. */
export const GLOSSARY: Record<string, { label: string; def: string; formula?: string }> = {
  users: { label: "Users", def: "Distinct people (devices/browsers) who visited.", formula: "GA4 totalUsers" },
  newUsers: { label: "New users", def: "People visiting for the first time in this period." },
  sessions: { label: "Sessions", def: "Visits. A session ends after 30 minutes of inactivity." },
  engagedSessions: {
    label: "Engaged sessions",
    def: "Visits that lasted 10+ seconds, had a key event, or viewed 2+ pages.",
  },
  engagementRate: { label: "Engagement rate", def: "Share of visits that were engaged.", formula: "engaged sessions ÷ sessions" },
  bounceRate: { label: "Bounce rate", def: "Share of visits that were NOT engaged. Lower is better.", formula: "1 − engagement rate" },
  keyEvents: {
    label: "Key events",
    def: "Actions marked as important in GA4 (formerly 'conversions'), e.g. purchase, add to cart.",
  },
  conversionRate: {
    label: "Conversion rate",
    def: "Share of sessions with at least one key event.",
    formula: "GA4 sessionKeyEventRate",
  },
  revenue: { label: "Revenue", def: "Purchase revenue recorded by GA4 e-commerce tracking, in ₹.", formula: "GA4 purchaseRevenue" },
  transactions: { label: "Transactions", def: "Number of completed purchases." },
  aov: { label: "Average order value", def: "Average revenue per purchase.", formula: "revenue ÷ transactions" },
  revenuePerSession: { label: "Revenue / session", def: "Revenue earned per visit.", formula: "revenue ÷ sessions" },
  engagementTime: {
    label: "Avg. engagement time",
    def: "Average time the page was in focus per session.",
    formula: "userEngagementDuration ÷ sessions",
  },
  pagesPerSession: { label: "Pages / session", def: "Average page views per visit.", formula: "screenPageViews ÷ sessions" },
  clicks: { label: "Clicks", def: "Clicks from Google Search results to the site (Search Console)." },
  impressions: { label: "Impressions", def: "Times a site URL appeared in Google results (Search Console)." },
  ctr: { label: "CTR", def: "Click-through rate from Google results.", formula: "clicks ÷ impressions" },
  position: {
    label: "Avg. position",
    def: "Average topmost ranking of the site in results. Lower is better (1 = top).",
  },
  expectedCtr: {
    label: "Expected CTR",
    def: "Typical CTR for this position, calibrated to this site's own CTR level.",
    formula: "industry benchmark curve × site calibration factor",
  },
  anonymized: {
    label: "Anonymized share",
    def: "Clicks Google hides at query level for privacy. Query tables therefore add up to less than the totals.",
    formula: "1 − (clicks with a visible query ÷ total clicks)",
  },
  healthScore: {
    label: "Business health score",
    def: "0–100 composite of traffic growth, engagement, conversion trend, organic visibility and tracking health.",
  },
  activeUsers: { label: "Active users", def: "Users active in the last 30 minutes (GA4 realtime)." },
  eventCount: { label: "Event count", def: "Number of times events fired." },
  itemsPerOrder: { label: "Items / order", def: "Average items purchased per transaction.", formula: "items purchased ÷ transactions" },
};
