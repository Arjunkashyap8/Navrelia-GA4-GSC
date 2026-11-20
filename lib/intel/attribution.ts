/**
 * Search → revenue attribution (GSC × GA4).
 *
 * GA4 knows revenue per organic landing page; Search Console knows which queries sent clicks to
 * that page. Each page's organic revenue is split across its queries in proportion to their clicks.
 * Because Google hides anonymized queries, only the visible share of the page's clicks is
 * attributed (visible query clicks ÷ total page clicks); the rest is reported as "anonymized".
 */

export interface QP {
  query: string;
  page: string;
  clicks: number;
  impressions: number;
  position: number;
}

export interface PageValue {
  revenue: number;
  conversions: number;
  sessions: number;
}

export interface QueryValue {
  query: string;
  revenue: number;
  conversions: number;
  clicks: number;
  impressions: number;
  revenuePerClick: number;
  topPage: string;
}

export function attributeToQueries(rows: QP[], pageValue: Map<string, PageValue>, pageTotalClicks?: Map<string, number>) {
  const visibleByPage = new Map<string, number>();
  for (const r of rows) visibleByPage.set(r.page, (visibleByPage.get(r.page) ?? 0) + r.clicks);

  const out = new Map<string, QueryValue & { _topPageClicks: number }>();
  let attributed = 0;
  for (const r of rows) {
    const visible = visibleByPage.get(r.page) ?? 0;
    const v = pageValue.get(r.page);
    const total = Math.max(pageTotalClicks?.get(r.page) ?? visible, visible);
    const share = visible && v ? (r.clicks / visible) * (visible / (total || 1)) : 0;
    const rev = v ? v.revenue * share : 0;
    const conv = v ? v.conversions * share : 0;
    attributed += rev;
    const e = out.get(r.query) ?? { query: r.query, revenue: 0, conversions: 0, clicks: 0, impressions: 0, revenuePerClick: 0, topPage: r.page, _topPageClicks: -1 };
    e.revenue += rev;
    e.conversions += conv;
    e.clicks += r.clicks;
    e.impressions += r.impressions;
    if (r.clicks > e._topPageClicks) {
      e.topPage = r.page;
      e._topPageClicks = r.clicks;
    }
    out.set(r.query, e);
  }
  const totalRevenue = [...pageValue.entries()].filter(([p]) => visibleByPage.has(p)).reduce((s, [, v]) => s + v.revenue, 0);
  const queries: QueryValue[] = [...out.values()].map(({ _topPageClicks, ...q }) => {
    void _topPageClicks;
    return { ...q, revenuePerClick: q.clicks ? q.revenue / q.clicks : 0 };
  });
  return { queries: queries.sort((a, b) => b.revenue - a.revenue), attributed, anonymizedRevenue: Math.max(0, totalRevenue - attributed) };
}
