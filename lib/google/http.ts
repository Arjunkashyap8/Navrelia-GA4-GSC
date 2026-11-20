import "server-only";

export type GoogleService = "oauth" | "ga4-data" | "ga4-admin" | "gsc" | "gsc-inspection";

/** Error safe to show in the UI: contains Google's message, never request headers or tokens. */
export class GoogleApiError extends Error {
  constructor(
    public readonly service: GoogleService,
    public readonly status: number,
    message: string,
    public readonly reason?: string,
  ) {
    super(message);
    this.name = "GoogleApiError";
  }
}

const RETRYABLE = new Set([408, 429, 500, 502, 503, 504]);
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** "Equal jitter" exponential backoff: half fixed, half random, doubling per attempt. */
function backoffMs(attempt: number, baseMs: number) {
  const cap = Math.min(baseMs * 2 ** attempt, 20_000);
  return Math.round(cap / 2 + Math.random() * (cap / 2));
}

export interface RetryOptions {
  retries?: number;
  baseMs?: number;
  timeoutMs?: number;
}

/** fetch with timeout + exponential backoff with jitter on network errors, 429 and 5xx. */
export async function fetchWithRetry(url: string, init: RequestInit, opts: RetryOptions = {}) {
  const retries = opts.retries ?? 4;
  const baseMs = opts.baseMs ?? 500;
  const timeoutMs = opts.timeoutMs ?? 30_000;

  for (let attempt = 0; ; attempt++) {
    let res: Response;
    try {
      res = await fetch(url, { ...init, cache: "no-store", signal: AbortSignal.timeout(timeoutMs) });
    } catch (err) {
      if (attempt >= retries) throw err;
      await sleep(backoffMs(attempt, baseMs));
      continue;
    }
    if (!RETRYABLE.has(res.status) || attempt >= retries) return res;
    const retryAfter = Number(res.headers.get("retry-after"));
    await res.body?.cancel().catch(() => undefined);
    await sleep(
      Number.isFinite(retryAfter) && retryAfter > 0
        ? Math.min(retryAfter * 1000, 30_000)
        : backoffMs(attempt, baseMs),
    );
  }
}

/** Convert a non-2xx Google response into a GoogleApiError with a readable message. */
export async function toGoogleError(service: GoogleService, res: Response): Promise<GoogleApiError> {
  const text = await res.text().catch(() => "");
  let message = `${service} request failed with HTTP ${res.status}`;
  let reason: string | undefined;
  try {
    const json = JSON.parse(text) as {
      error?:
        | string
        | { message?: string; status?: string; errors?: { reason?: string }[]; details?: unknown[] };
      error_description?: string;
    };
    if (typeof json.error === "string") {
      reason = json.error;
      message = json.error_description ?? json.error;
    } else if (json.error) {
      message = json.error.message ?? message;
      reason = json.error.errors?.[0]?.reason ?? json.error.status;
    }
  } catch {
    // Non-JSON body (HTML error page etc.) — keep the generic message.
  }
  return new GoogleApiError(service, res.status, message.slice(0, 500), reason);
}
