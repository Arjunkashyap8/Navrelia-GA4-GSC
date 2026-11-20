import "server-only";
import { z } from "zod";
import { GoogleApiError } from "./http";
import { googleJson } from "./request";

/**
 * URL Inspection API with client-side rate limiting.
 * Google limits: 2,000 inspections/day and 600/minute per property.
 * We stay under both (1,900/day, 550/min) and wait when the minute window is full.
 * Results are cached in SQLite from step 3; the queue runner lives in the Technical module (step 5).
 */

const DAY_LIMIT = 1_900;
const MINUTE_LIMIT = 550;

interface LimiterState {
  day: string;
  dayCount: number;
  recent: number[];
}

const g = globalThis as unknown as { __navreliaInspect?: LimiterState };

async function acquireSlot() {
  const today = new Date().toISOString().slice(0, 10); // Google resets quota on Pacific days; UTC is a safe proxy.
  const s = (g.__navreliaInspect ??= { day: today, dayCount: 0, recent: [] });
  if (s.day !== today) Object.assign(s, { day: today, dayCount: 0, recent: [] });
  if (s.dayCount >= DAY_LIMIT) {
    throw new GoogleApiError("gsc-inspection", 429, "Daily URL Inspection budget reached (1,900 of 2,000).", "daily_limit");
  }
  for (;;) {
    const now = Date.now();
    s.recent = s.recent.filter((t) => now - t < 60_000);
    if (s.recent.length < MINUTE_LIMIT) break;
    await new Promise((r) => setTimeout(r, 60_000 - (now - s.recent[0]!) + 50));
  }
  s.recent.push(Date.now());
  s.dayCount++;
}

export function inspectionBudget() {
  const s = g.__navreliaInspect;
  return { usedToday: s?.dayCount ?? 0, dailyLimit: DAY_LIMIT };
}

const InspectionSchema = z.object({
  inspectionResult: z
    .object({
      inspectionResultLink: z.string().optional(),
      indexStatusResult: z
        .object({
          verdict: z.string().optional(),
          coverageState: z.string().optional(),
          robotsTxtState: z.string().optional(),
          indexingState: z.string().optional(),
          lastCrawlTime: z.string().optional(),
          pageFetchState: z.string().optional(),
          googleCanonical: z.string().optional(),
          userCanonical: z.string().optional(),
          crawledAs: z.string().optional(),
          sitemap: z.array(z.string()).optional(),
          referringUrls: z.array(z.string()).optional(),
        })
        .passthrough()
        .optional(),
      mobileUsabilityResult: z.object({ verdict: z.string().optional() }).passthrough().optional(),
      richResultsResult: z
        .object({
          verdict: z.string().optional(),
          detectedItems: z.array(z.object({ richResultType: z.string().optional() }).passthrough()).optional(),
        })
        .passthrough()
        .optional(),
    })
    .passthrough()
    .optional(),
});

export type InspectionResult = z.infer<typeof InspectionSchema>["inspectionResult"];

export async function inspectUrl(siteUrl: string, inspectionUrl: string): Promise<InspectionResult> {
  await acquireSlot();
  const res = await googleJson({
    client: "gsc",
    service: "gsc-inspection",
    method: "POST",
    url: "https://searchconsole.googleapis.com/v1/urlInspection/index:inspect",
    body: { inspectionUrl, siteUrl, languageCode: "en-IN" },
    schema: InspectionSchema,
  });
  return res.inspectionResult;
}
