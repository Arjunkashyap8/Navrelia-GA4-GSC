import "server-only";
import { z } from "zod";
import { getEnv } from "@/lib/env";
import { GoogleApiError } from "./http";
import { googleJson } from "./request";

/** GA4 Admin API v1beta: property details, key events, custom dimensions. */

const BASE = "https://analyticsadmin.googleapis.com/v1beta";

const PropertySchema = z
  .object({
    name: z.string(),
    displayName: z.string(),
    timeZone: z.string().optional(),
    currencyCode: z.string().optional(),
    createTime: z.string().optional(),
    industryCategory: z.string().optional(),
    serviceLevel: z.string().optional(),
  })
  .passthrough();

export async function getProperty() {
  return googleJson({
    client: "ga4",
    service: "ga4-admin",
    url: `${BASE}/${getEnv().GA4_PROPERTY_ID}`,
    schema: PropertySchema,
  });
}

const KeyEvent = z
  .object({
    eventName: z.string(),
    countingMethod: z.string().optional(),
    createTime: z.string().optional(),
    custom: z.boolean().optional(),
  })
  .passthrough();

async function paginate<T>(
  urlFor: (pageToken?: string) => string,
  schema: z.ZodType<{ items: T[]; next?: string }, z.ZodTypeDef, unknown>,
): Promise<T[]> {
  const out: T[] = [];
  let pageToken: string | undefined;
  for (let page = 0; page < 20; page++) {
    const res = await googleJson({ client: "ga4", service: "ga4-admin", url: urlFor(pageToken), schema });
    out.push(...res.items);
    if (!res.next) break;
    pageToken = res.next;
  }
  return out;
}

/** Key events (formerly "conversions"). Falls back to the legacy conversionEvents endpoint. */
export async function listKeyEvents(): Promise<z.infer<typeof KeyEvent>[]> {
  const prop = getEnv().GA4_PROPERTY_ID;
  const qs = (t?: string) => `pageSize=200${t ? `&pageToken=${encodeURIComponent(t)}` : ""}`;
  try {
    return await paginate(
      (t) => `${BASE}/${prop}/keyEvents?${qs(t)}`,
      z
        .object({ keyEvents: z.array(KeyEvent).optional(), nextPageToken: z.string().optional() })
        .transform((r) => ({ items: r.keyEvents ?? [], next: r.nextPageToken || undefined })),
    );
  } catch (err) {
    if (!(err instanceof GoogleApiError) || err.status !== 404) throw err;
    return paginate(
      (t) => `${BASE}/${prop}/conversionEvents?${qs(t)}`,
      z
        .object({ conversionEvents: z.array(KeyEvent).optional(), nextPageToken: z.string().optional() })
        .transform((r) => ({ items: r.conversionEvents ?? [], next: r.nextPageToken || undefined })),
    );
  }
}

const CustomDimension = z
  .object({
    parameterName: z.string(),
    displayName: z.string().optional(),
    scope: z.string().optional(),
  })
  .passthrough();

export async function listCustomDimensions() {
  const prop = getEnv().GA4_PROPERTY_ID;
  return paginate(
    (t) => `${BASE}/${prop}/customDimensions?pageSize=200${t ? `&pageToken=${encodeURIComponent(t)}` : ""}`,
    z
      .object({ customDimensions: z.array(CustomDimension).optional(), nextPageToken: z.string().optional() })
      .transform((r) => ({ items: r.customDimensions ?? [], next: r.nextPageToken || undefined })),
  );
}
