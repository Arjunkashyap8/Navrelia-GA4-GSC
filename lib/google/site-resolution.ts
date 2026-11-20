/**
 * Search Console property resolution (pure — unit tested).
 *
 * Preference order for SITE_ORIGIN=https://navreliafoods.com:
 *   1. sc-domain:navreliafoods.com           (Domain property: covers all hosts + protocols)
 *   2. https://navreliafoods.com/ or https://www.navreliafoods.com/   (URL-prefix, https first)
 *   3. http:// equivalents
 * Properties where the account is only `siteUnverifiedUser` are ignored (the API rejects queries).
 */

export interface GscSiteEntry {
  siteUrl: string;
  permissionLevel?: string;
}

export function resolveGscSite(siteOrigin: string, sites: GscSiteEntry[]): GscSiteEntry | null {
  const host = new URL(siteOrigin).hostname.toLowerCase();
  const bare = host.replace(/^www\./, "");
  const usable = sites.filter((s) => s.permissionLevel !== "siteUnverifiedUser");
  const find = (url: string) => usable.find((s) => s.siteUrl.toLowerCase() === url);

  const domain = find(`sc-domain:${bare}`);
  if (domain) return domain;

  const candidates = [
    `https://${host}/`,
    `https://${bare}/`,
    `https://www.${bare}/`,
    `http://${host}/`,
    `http://${bare}/`,
    `http://www.${bare}/`,
  ];
  for (const c of candidates) {
    const m = find(c);
    if (m) return m;
  }
  return null;
}
