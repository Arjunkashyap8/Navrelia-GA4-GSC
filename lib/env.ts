import "server-only";
import { z } from "zod";

/**
 * Server-side environment, validated with Zod.
 *
 * Rules:
 * - Never import this from a client component (enforced by `server-only`).
 * - Never return secret values to the client. `envSummary()` reports only set / not set.
 * - Google credentials are optional at parse time so the app can boot and show a clear
 *   "not configured" state instead of crashing. Each Google client checks its own.
 */

const blankToUndefined = (v: unknown) => {
  if (typeof v !== "string") return v;
  const t = v.trim();
  return t === "" ? undefined : t;
};

const optionalString = z.preprocess(blankToUndefined, z.string().optional());

function isValidTimeZone(tz: string) {
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: tz });
    return true;
  } catch {
    return false;
  }
}

const envSchema = z.object({
  GA4_CLIENT_ID: optionalString,
  GA4_CLIENT_SECRET: optionalString,
  GA4_REFRESH_TOKEN: optionalString,
  GA4_PROPERTY_ID: z.preprocess(
    (v) => {
      const s = blankToUndefined(v);
      return typeof s === "string" && /^\d+$/.test(s) ? `properties/${s}` : s;
    },
    z
      .string()
      .regex(/^properties\/\d+$/, "must look like properties/123456789")
      .default("properties/422569923"),
  ),
  GA4_MEASUREMENT_ID: z.preprocess(
    blankToUndefined,
    z.string().regex(/^G-[A-Z0-9]+$/, "must look like G-XXXXXXX").optional(),
  ),
  GSC_CLIENT_ID: optionalString,
  GSC_CLIENT_SECRET: optionalString,
  GSC_REFRESH_TOKEN: optionalString,
  GSC_SITE_URL: z.preprocess(
    blankToUndefined,
    z
      .string()
      .refine(
        (s) => s.startsWith("sc-domain:") || /^https?:\/\//.test(s),
        "must start with sc-domain: or http(s)://",
      )
      .optional(),
  ),
  GOOGLE_TOKEN_ENDPOINT: z.preprocess(
    blankToUndefined,
    z
      .string()
      .url()
      .refine((s) => s.startsWith("https://"), "must be https")
      .default("https://oauth2.googleapis.com/token"),
  ),
  SITE_ORIGIN: z.preprocess(blankToUndefined, z.string().url().default("https://navreliafoods.com")),
  REPORT_CURRENCY: z.preprocess(
    blankToUndefined,
    z.string().regex(/^[A-Z]{3}$/, "must be a 3-letter ISO code").default("INR"),
  ),
  REPORT_TIMEZONE: z.preprocess(
    blankToUndefined,
    z.string().refine(isValidTimeZone, "is not a valid IANA time zone").default("Asia/Calcutta"),
  ),
  BRAND_TERMS: z.preprocess(
    blankToUndefined,
    z
      .string()
      .default("navrelia,nav relia,navrelia foods")
      .transform((s) =>
        s
          .split(",")
          .map((t) => t.trim().toLowerCase())
          .filter(Boolean),
      ),
  ),
  DASHBOARD_PASSWORD: z.preprocess(
    blankToUndefined,
    z.string().min(8, "must be at least 8 characters").optional(),
  ),
  ANTHROPIC_API_KEY: optionalString,
});

export type Env = z.infer<typeof envSchema>;

export class EnvError extends Error {
  constructor(public readonly issues: string[]) {
    super(`Invalid environment configuration:\n- ${issues.join("\n- ")}`);
    this.name = "EnvError";
  }
}

let cached: Env | undefined;

export function getEnv(): Env {
  if (cached) return cached;
  const parsed = envSchema.safeParse(process.env);
  if (!parsed.success) {
    // Issue messages contain variable names and rules only — never values.
    throw new EnvError(parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`));
  }
  cached = parsed.data;
  return cached;
}

export type GoogleClient = "ga4" | "gsc";

export type GoogleCredentials =
  | { ok: true; clientId: string; clientSecret: string; refreshToken: string }
  | { ok: false; missing: string[] };

export function getGoogleCredentials(client: GoogleClient): GoogleCredentials {
  const env = getEnv();
  const prefix = client === "ga4" ? "GA4" : "GSC";
  const values = {
    clientId: env[`${prefix}_CLIENT_ID`],
    clientSecret: env[`${prefix}_CLIENT_SECRET`],
    refreshToken: env[`${prefix}_REFRESH_TOKEN`],
  };
  const missing = [
    !values.clientId && `${prefix}_CLIENT_ID`,
    !values.clientSecret && `${prefix}_CLIENT_SECRET`,
    !values.refreshToken && `${prefix}_REFRESH_TOKEN`,
  ].filter((m): m is string => Boolean(m));
  if (missing.length || !values.clientId || !values.clientSecret || !values.refreshToken) {
    return { ok: false, missing };
  }
  return {
    ok: true,
    clientId: values.clientId,
    clientSecret: values.clientSecret,
    refreshToken: values.refreshToken,
  };
}

export interface EnvVarStatus {
  name: string;
  group: "GA4" | "Search Console" | "Site" | "Access" | "AI";
  secret: boolean;
  set: boolean;
  /** Only for non-secret values. */
  value?: string;
  required: boolean;
}

/** Safe-to-render summary: secrets report set / not set only. */
export function envSummary(): EnvVarStatus[] {
  const env = getEnv();
  const raw = process.env;
  const isSet = (k: string) => Boolean(raw[k]?.trim());
  const row = (
    name: keyof Env,
    group: EnvVarStatus["group"],
    secret: boolean,
    required: boolean,
  ): EnvVarStatus => {
    const v = env[name];
    return {
      name,
      group,
      secret,
      required,
      set: isSet(name),
      value: secret ? undefined : Array.isArray(v) ? v.join(", ") : (v ?? undefined),
    };
  };
  return [
    row("GA4_CLIENT_ID", "GA4", true, true),
    row("GA4_CLIENT_SECRET", "GA4", true, true),
    row("GA4_REFRESH_TOKEN", "GA4", true, true),
    row("GA4_PROPERTY_ID", "GA4", false, true),
    row("GA4_MEASUREMENT_ID", "GA4", false, false),
    row("GSC_CLIENT_ID", "Search Console", true, true),
    row("GSC_CLIENT_SECRET", "Search Console", true, true),
    row("GSC_REFRESH_TOKEN", "Search Console", true, true),
    row("GSC_SITE_URL", "Search Console", false, false),
    row("GOOGLE_TOKEN_ENDPOINT", "Site", false, true),
    row("SITE_ORIGIN", "Site", false, true),
    row("REPORT_CURRENCY", "Site", false, true),
    row("REPORT_TIMEZONE", "Site", false, true),
    row("BRAND_TERMS", "Site", false, false),
    row("DASHBOARD_PASSWORD", "Access", true, false),
  ];
}
