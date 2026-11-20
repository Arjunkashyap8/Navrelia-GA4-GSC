import "server-only";
import { z } from "zod";
import { getEnv } from "@/lib/env";
import { googleJson } from "./request";
import { recordGa4Quota } from "./usage";

/** GA4 Data API v1beta client. All calls request `returnPropertyQuota` so quota is always visible. */

const BASE = "https://analyticsdata.googleapis.com/v1beta";

const QuotaStatus = z.object({ consumed: z.number().optional(), remaining: z.number().optional() });
export const PropertyQuotaSchema = z
  .object({
    tokensPerDay: QuotaStatus,
    tokensPerHour: QuotaStatus,
    concurrentRequests: QuotaStatus,
    serverErrorsPerProjectPerHour: QuotaStatus,
    potentiallyThresholdedRequestsPerHour: QuotaStatus,
    tokensPerProjectPerHour: QuotaStatus,
  })
  .partial();

const Value = z.object({ value: z.string().optional() });
const Row = z.object({
  dimensionValues: z.array(Value).optional(),
  metricValues: z.array(Value).optional(),
});

export const RunReportResponseSchema = z
  .object({
    dimensionHeaders: z.array(z.object({ name: z.string() })).optional(),
    metricHeaders: z.array(z.object({ name: z.string(), type: z.string().optional() })).optional(),
    rows: z.array(Row).optional(),
    totals: z.array(Row).optional(),
    rowCount: z.number().optional(),
    metadata: z
      .object({
        dataLossFromOtherRow: z.boolean().optional(),
        subjectToThresholding: z.boolean().optional(),
        samplingMetadatas: z
          .array(z.object({ samplesReadCount: z.string().optional(), samplingSpaceSize: z.string().optional() }))
          .optional(),
        currencyCode: z.string().optional(),
        timeZone: z.string().optional(),
        emptyReason: z.string().optional(),
      })
      .passthrough()
      .optional(),
    propertyQuota: PropertyQuotaSchema.optional(),
  })
  .passthrough();

export type RunReportResponse = z.infer<typeof RunReportResponseSchema>;

export interface Ga4DateRange {
  startDate: string;
  endDate: string;
  name?: string;
}

export interface RunReportRequest {
  dateRanges?: Ga4DateRange[];
  dimensions?: { name: string }[];
  metrics?: { name: string; expression?: string }[];
  dimensionFilter?: unknown;
  metricFilter?: unknown;
  orderBys?: unknown[];
  limit?: number;
  offset?: number;
  keepEmptyRows?: boolean;
  metricAggregations?: ("TOTAL" | "MAXIMUM" | "MINIMUM" | "COUNT")[];
  currencyCode?: string;
  cohortSpec?: unknown;
}

function property() {
  return getEnv().GA4_PROPERTY_ID;
}

function noteQuota(res: { propertyQuota?: z.infer<typeof PropertyQuotaSchema> }) {
  if (res.propertyQuota) recordGa4Quota(res.propertyQuota);
}

export async function runReport(req: RunReportRequest): Promise<RunReportResponse> {
  const res = await googleJson({
    client: "ga4",
    service: "ga4-data",
    method: "POST",
    url: `${BASE}/${property()}:runReport`,
    body: { ...req, returnPropertyQuota: true },
    schema: RunReportResponseSchema,
  });
  noteQuota(res);
  return res;
}

/** Runs any number of reports, chunked into batchRunReports calls of up to 5. */
export async function batchRunReports(requests: RunReportRequest[]): Promise<RunReportResponse[]> {
  const out: RunReportResponse[] = [];
  for (let i = 0; i < requests.length; i += 5) {
    const chunk = requests.slice(i, i + 5);
    const res = await googleJson({
      client: "ga4",
      service: "ga4-data",
      method: "POST",
      url: `${BASE}/${property()}:batchRunReports`,
      body: { requests: chunk.map((r) => ({ ...r, returnPropertyQuota: true })) },
      schema: z.object({ reports: z.array(RunReportResponseSchema).optional() }).passthrough(),
    });
    const reports = res.reports ?? [];
    reports.forEach(noteQuota);
    out.push(...reports);
  }
  return out;
}

export async function runRealtimeReport(req: Omit<RunReportRequest, "dateRanges">): Promise<RunReportResponse> {
  const res = await googleJson({
    client: "ga4",
    service: "ga4-data",
    method: "POST",
    url: `${BASE}/${property()}:runRealtimeReport`,
    body: { ...req, returnPropertyQuota: true },
    schema: RunReportResponseSchema,
  });
  noteQuota(res);
  return res;
}

const MetadataItem = z
  .object({
    apiName: z.string(),
    uiName: z.string().optional(),
    category: z.string().optional(),
    customDefinition: z.boolean().optional(),
    type: z.string().optional(),
  })
  .passthrough();

export const MetadataSchema = z.object({
  dimensions: z.array(MetadataItem).optional(),
  metrics: z.array(MetadataItem).optional(),
});

export async function getMetadata() {
  return googleJson({
    client: "ga4",
    service: "ga4-data",
    url: `${BASE}/${property()}/metadata`,
    schema: MetadataSchema,
  });
}

const Compat = z.object({
  dimensionCompatibilities: z
    .array(z.object({ dimensionMetadata: MetadataItem.optional(), compatibility: z.string().optional() }))
    .optional(),
  metricCompatibilities: z
    .array(z.object({ metricMetadata: MetadataItem.optional(), compatibility: z.string().optional() }))
    .optional(),
});

/** Returns names of the requested dimensions/metrics that are INCOMPATIBLE together. */
export async function checkCompatibility(dimensions: string[], metrics: string[]) {
  const res = await googleJson({
    client: "ga4",
    service: "ga4-data",
    method: "POST",
    url: `${BASE}/${property()}:checkCompatibility`,
    body: {
      dimensions: dimensions.map((name) => ({ name })),
      metrics: metrics.map((name) => ({ name })),
    },
    schema: Compat,
  });
  const bad = (c?: string) => c === "INCOMPATIBLE";
  return {
    dimensions: (res.dimensionCompatibilities ?? [])
      .filter((d) => bad(d.compatibility))
      .map((d) => d.dimensionMetadata?.apiName ?? "?")
      .filter((n) => dimensions.includes(n)),
    metrics: (res.metricCompatibilities ?? [])
      .filter((m) => bad(m.compatibility))
      .map((m) => m.metricMetadata?.apiName ?? "?")
      .filter((n) => metrics.includes(n)),
  };
}

/** Flatten a report into plain objects: dimensions as strings, metrics as numbers. */
export function reportRows(res: RunReportResponse): Record<string, string | number>[] {
  const dims = res.dimensionHeaders?.map((h) => h.name) ?? [];
  const mets = res.metricHeaders?.map((h) => h.name) ?? [];
  return (res.rows ?? []).map((row) => {
    const o: Record<string, string | number> = {};
    dims.forEach((name, i) => (o[name] = row.dimensionValues?.[i]?.value ?? ""));
    mets.forEach((name, i) => (o[name] = Number(row.metricValues?.[i]?.value ?? 0)));
    return o;
  });
}

/* ───────────────────────── Pivot reports (v1beta) ───────────────────────── */

export interface PivotRequest {
  dateRanges: Ga4DateRange[];
  dimensions: { name: string }[];
  metrics: { name: string }[];
  pivots: { fieldNames: string[]; limit: number; orderBys?: unknown[] }[];
  dimensionFilter?: unknown;
}

const PivotResponseSchema = z
  .object({
    dimensionHeaders: z.array(z.object({ name: z.string() })).optional(),
    metricHeaders: z.array(z.object({ name: z.string() })).optional(),
    rows: z.array(Row).optional(),
    metadata: z.object({ subjectToThresholding: z.boolean().optional() }).passthrough().optional(),
    propertyQuota: PropertyQuotaSchema.optional(),
  })
  .passthrough();

export type PivotResponse = z.infer<typeof PivotResponseSchema>;

/** Pivot report: rows are flat (one value per requested dimension, in request order). */
export async function runPivotReport(req: PivotRequest): Promise<PivotResponse> {
  const res = await googleJson({
    client: "ga4",
    service: "ga4-data",
    method: "POST",
    url: `${BASE}/${property()}:runPivotReport`,
    body: { ...req, returnPropertyQuota: true },
    schema: PivotResponseSchema,
  });
  noteQuota(res);
  return res;
}

/** Up to 5 pivot reports per call. */
export async function batchRunPivotReports(requests: PivotRequest[]): Promise<PivotResponse[]> {
  const out: PivotResponse[] = [];
  for (let i = 0; i < requests.length; i += 5) {
    const res = await googleJson({
      client: "ga4",
      service: "ga4-data",
      method: "POST",
      url: `${BASE}/${property()}:batchRunPivotReports`,
      body: { requests: requests.slice(i, i + 5).map((r) => ({ ...r, returnPropertyQuota: true })) },
      schema: z.object({ pivotReports: z.array(PivotResponseSchema).optional() }).passthrough(),
    });
    (res.pivotReports ?? []).forEach(noteQuota);
    out.push(...(res.pivotReports ?? []));
  }
  return out;
}

export function pivotRows(res: PivotResponse, dims: string[]): Record<string, string | number>[] {
  const mets = res.metricHeaders?.map((h) => h.name) ?? [];
  return (res.rows ?? []).map((row) => {
    const o: Record<string, string | number> = {};
    dims.forEach((d, i) => (o[d] = row.dimensionValues?.[i]?.value ?? ""));
    mets.forEach((m, i) => (o[m] = Number(row.metricValues?.[i]?.value ?? 0)));
    return o;
  });
}

/* ───────────────────────── Funnel reports (v1alpha) ───────────────────────── */

const ALPHA = "https://analyticsdata.googleapis.com/v1alpha";

export interface FunnelRequest {
  dateRanges: Ga4DateRange[];
  funnel: { isOpenFunnel?: boolean; steps: { name: string; filterExpression: unknown }[] };
  funnelBreakdown?: { breakdownDimension: { name: string }; limit?: number };
  funnelNextAction?: { nextActionDimension: { name: string }; limit?: number };
  dimensionFilter?: unknown;
}

const FunnelTable = z
  .object({
    dimensionHeaders: z.array(z.object({ name: z.string() })).optional(),
    metricHeaders: z.array(z.object({ name: z.string() })).optional(),
    rows: z.array(Row).optional(),
  })
  .passthrough();
const FunnelResponseSchema = z.object({ funnelTable: FunnelTable.optional(), funnelVisualization: FunnelTable.optional() }).passthrough();

export interface FunnelStepRow {
  step: string;
  index: number;
  segment: string;
  activeUsers: number;
  completionRate: number;
  abandonments: number;
  abandonmentRate: number;
}

/** Funnel report (GA4 Data API v1alpha). Step names come back as "1. view_item". */
export async function runFunnelReport(req: FunnelRequest) {
  const res = await googleJson({
    client: "ga4",
    service: "ga4-data",
    method: "POST",
    url: `${ALPHA}/${property()}:runFunnelReport`,
    body: req,
    schema: FunnelResponseSchema,
  });
  const parseStep = (v: string) => {
    const m = /^(\d+)\.\s*(.*)$/.exec(v);
    return m ? { index: Number(m[1]), step: m[2]! } : { index: 0, step: v };
  };
  const table: FunnelStepRow[] = (res.funnelTable?.rows ?? []).map((r) => {
    const s = parseStep(r.dimensionValues?.[0]?.value ?? "");
    const m = (i: number) => Number(r.metricValues?.[i]?.value ?? 0);
    return { ...s, segment: r.dimensionValues?.[1]?.value ?? "RESERVED_TOTAL", activeUsers: m(0), completionRate: m(1), abandonments: m(2), abandonmentRate: m(3) };
  });
  const nextActions = (res.funnelVisualization?.rows ?? [])
    .map((r) => ({ ...parseStep(r.dimensionValues?.[0]?.value ?? ""), action: r.dimensionValues?.[1]?.value ?? "", users: Number(r.metricValues?.[0]?.value ?? 0) }))
    .filter((r) => r.action && r.action !== "RESERVED_TOTAL");
  return { table, nextActions };
}
