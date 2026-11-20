import "server-only";
import { z } from "zod";
import { getEnv } from "@/lib/env";
import { GoogleApiError } from "./http";
import { googleJson } from "./request";
import { resolveGscSite, type GscSiteEntry } from "./site-resolution";

/** Search Console API (webmasters v3): sites, searchAnalytics, sitemaps. */

const BASE = "https://www.googleapis.com/webmasters/v3";
const MAX_ROW_LIMIT = 25_000;

const SitesSchema = z.object({
  siteEntry: z.array(z.object({ siteUrl: z.string(), permissionLevel: z.string().optional() })).optional(),
});

export async function listSites(): Promise<GscSiteEntry[]> {
  const res = await googleJson({ client: "gsc", service: "gsc", url: `${BASE}/sites`, schema: SitesSchema });
  return res.siteEntry ?? [];
}

export interface ResolvedSite {
  siteUrl: string;
  permissionLevel?: string;
  source: "env" | "auto";
  available: GscSiteEntry[];
}

const g = globalThis as unknown as { __navreliaGscSite?: ResolvedSite };

/**
 * Resolve the property to query. GSC_SITE_URL wins when set (and must be accessible);
 * otherwise prefer the sc-domain property matching SITE_ORIGIN, then URL-prefix.
 */
export async function resolveSite(opts: { refresh?: boolean } = {}): Promise<ResolvedSite> {
  if (g.__navreliaGscSite && !opts.refresh) return g.__navreliaGscSite;
  const env = getEnv();
  const available = await listSites();

  let resolved: ResolvedSite;
  if (env.GSC_SITE_URL) {
    const match = available.find((s) => s.siteUrl.toLowerCase() === env.GSC_SITE_URL!.toLowerCase());
    if (!match) {
      throw new GoogleApiError(
        "gsc",
        404,
        `GSC_SITE_URL "${env.GSC_SITE_URL}" is not accessible to this Google account. ` +
          `Accessible properties: ${available.map((s) => s.siteUrl).join(", ") || "none"}.`,
        "site_not_accessible",
      );
    }
    resolved = { siteUrl: match.siteUrl, permissionLevel: match.permissionLevel, source: "env", available };
  } else {
    const match = resolveGscSite(env.SITE_ORIGIN, available);
    if (!match) {
      throw new GoogleApiError(
        "gsc",
        404,
        `No verified Search Console property matches ${env.SITE_ORIGIN}. ` +
          `Accessible properties: ${available.map((s) => s.siteUrl).join(", ") || "none"}.`,
        "site_not_found",
      );
    }
    resolved = { siteUrl: match.siteUrl, permissionLevel: match.permissionLevel, source: "auto", available };
  }
  g.__navreliaGscSite = resolved;
  return resolved;
}

export type GscDimension = "date" | "query" | "page" | "country" | "device" | "searchAppearance";
export type GscSearchType = "web" | "image" | "video" | "news" | "discover" | "googleNews";

export interface SearchAnalyticsRequest {
  startDate: string;
  endDate: string;
  dimensions?: GscDimension[];
  type?: GscSearchType;
  dimensionFilterGroups?: unknown[];
  aggregationType?: "auto" | "byPage" | "byProperty" | "byNewsShowcasePanel";
  rowLimit?: number;
  startRow?: number;
  /** "all" includes fresh (preliminary) data; default "final". */
  dataState?: "final" | "all";
}

const SearchAnalyticsSchema = z.object({
  rows: z
    .array(
      z.object({
        keys: z.array(z.string()).optional(),
        clicks: z.number(),
        impressions: z.number(),
        ctr: z.number(),
        // Discover / Google News responses omit position.
        position: z.number().default(0),
      }),
    )
    .optional(),
  responseAggregationType: z.string().optional(),
});

export type SearchAnalyticsRow = NonNullable<z.infer<typeof SearchAnalyticsSchema>["rows"]>[number];

export async function querySearchAnalytics(siteUrl: string, req: SearchAnalyticsRequest) {
  return googleJson({
    client: "gsc",
    service: "gsc",
    method: "POST",
    url: `${BASE}/sites/${encodeURIComponent(siteUrl)}/searchAnalytics/query`,
    body: { ...req, rowLimit: Math.min(req.rowLimit ?? MAX_ROW_LIMIT, MAX_ROW_LIMIT) },
    schema: SearchAnalyticsSchema,
  });
}

/** Paginates with startRow / rowLimit 25,000 until exhausted or `maxRows` reached. */
export async function queryAllSearchAnalytics(
  siteUrl: string,
  req: Omit<SearchAnalyticsRequest, "rowLimit" | "startRow">,
  maxRows = 500_000,
): Promise<SearchAnalyticsRow[]> {
  const rows: SearchAnalyticsRow[] = [];
  for (let startRow = 0; startRow < maxRows; startRow += MAX_ROW_LIMIT) {
    const res = await querySearchAnalytics(siteUrl, { ...req, rowLimit: MAX_ROW_LIMIT, startRow });
    const page = res.rows ?? [];
    rows.push(...page);
    if (page.length < MAX_ROW_LIMIT) break;
  }
  return rows.slice(0, maxRows);
}

const SitemapsSchema = z.object({
  sitemap: z
    .array(
      z
        .object({
          path: z.string(),
          lastSubmitted: z.string().optional(),
          lastDownloaded: z.string().optional(),
          isPending: z.boolean().optional(),
          isSitemapsIndex: z.boolean().optional(),
          type: z.string().optional(),
          warnings: z.coerce.number().optional(),
          errors: z.coerce.number().optional(),
          contents: z
            .array(
              z.object({
                type: z.string().optional(),
                submitted: z.coerce.number().optional(),
                indexed: z.coerce.number().optional(),
              }),
            )
            .optional(),
        })
        .passthrough(),
    )
    .optional(),
});

export async function listSitemaps(siteUrl: string) {
  const res = await googleJson({
    client: "gsc",
    service: "gsc",
    url: `${BASE}/sites/${encodeURIComponent(siteUrl)}/sitemaps`,
    schema: SitemapsSchema,
  });
  return res.sitemap ?? [];
}

/** Property details (permission level) for the resolved site. */
export async function getSiteDetails(siteUrl: string) {
  return googleJson({
    client: "gsc",
    service: "gsc",
    url: `${BASE}/sites/${encodeURIComponent(siteUrl)}`,
    schema: z.object({ siteUrl: z.string(), permissionLevel: z.string().optional() }),
  });
}

/** Details for one submitted sitemap (feedpath = full sitemap URL). */
export async function getSitemap(siteUrl: string, feedpath: string) {
  const res = await googleJson({
    client: "gsc",
    service: "gsc",
    url: `${BASE}/sites/${encodeURIComponent(siteUrl)}/sitemaps/${encodeURIComponent(feedpath)}`,
    schema: SitemapsSchema.shape.sitemap.unwrap().element,
  });
  return res;
}
