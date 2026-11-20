import { describe, expect, it } from "vitest";
import { resolveGscSite } from "./site-resolution";

const ORIGIN = "https://navreliafoods.com";

describe("resolveGscSite", () => {
  it("prefers the sc-domain property", () => {
    const r = resolveGscSite(ORIGIN, [
      { siteUrl: "https://navreliafoods.com/", permissionLevel: "siteOwner" },
      { siteUrl: "sc-domain:navreliafoods.com", permissionLevel: "siteFullUser" },
    ]);
    expect(r?.siteUrl).toBe("sc-domain:navreliafoods.com");
  });

  it("falls back to https URL-prefix, including www", () => {
    const r = resolveGscSite(ORIGIN, [
      { siteUrl: "http://navreliafoods.com/", permissionLevel: "siteOwner" },
      { siteUrl: "https://www.navreliafoods.com/", permissionLevel: "siteOwner" },
    ]);
    expect(r?.siteUrl).toBe("https://www.navreliafoods.com/");
  });

  it("ignores unverified properties and unrelated sites", () => {
    expect(
      resolveGscSite(ORIGIN, [
        { siteUrl: "sc-domain:navreliafoods.com", permissionLevel: "siteUnverifiedUser" },
        { siteUrl: "sc-domain:example.com", permissionLevel: "siteOwner" },
      ]),
    ).toBeNull();
  });
});
