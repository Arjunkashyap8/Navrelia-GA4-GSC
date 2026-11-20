import "server-only";
import type { z } from "zod";
import type { GoogleClient } from "@/lib/env";
import { getAccessToken, invalidateToken } from "./auth";
import { fetchWithRetry, GoogleApiError, toGoogleError, type GoogleService } from "./http";
import { recordCall } from "./usage";

interface GoogleJsonOptions<S extends z.ZodTypeAny> {
  client: GoogleClient;
  service: GoogleService;
  url: string;
  method?: "GET" | "POST";
  body?: unknown;
  schema: S;
}

/**
 * Authenticated JSON request to a Google API with:
 * - retry/backoff on 429/5xx (fetchWithRetry)
 * - one transparent token refresh on 401
 * - Zod validation of the response body
 */
export async function googleJson<S extends z.ZodTypeAny>(opts: GoogleJsonOptions<S>): Promise<z.infer<S>> {
  for (let authAttempt = 0; authAttempt < 2; authAttempt++) {
    const token = await getAccessToken(opts.client);
    const res = await fetchWithRetry(opts.url, {
      method: opts.method ?? "GET",
      headers: {
        authorization: `Bearer ${token}`,
        accept: "application/json",
        ...(opts.body !== undefined ? { "content-type": "application/json" } : {}),
      },
      body: opts.body !== undefined ? JSON.stringify(opts.body) : undefined,
    });
    recordCall(opts.service);

    if (res.status === 401 && authAttempt === 0) {
      await res.body?.cancel().catch(() => undefined);
      invalidateToken(opts.client);
      continue;
    }
    if (!res.ok) throw await toGoogleError(opts.service, res);

    const json: unknown = await res.json();
    const parsed = opts.schema.safeParse(json);
    if (!parsed.success) {
      const issue = parsed.error.issues[0];
      throw new GoogleApiError(
        opts.service,
        res.status,
        `Unexpected response shape from ${opts.service}${issue ? ` at "${issue.path.join(".")}": ${issue.message}` : ""}`,
      );
    }
    return parsed.data;
  }
  throw new GoogleApiError(opts.service, 401, "Still unauthorized after refreshing the access token.");
}
