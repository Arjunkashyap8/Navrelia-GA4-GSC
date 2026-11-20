import "server-only";
import { EnvError } from "@/lib/env";
import { TokenError } from "./auth";
import type { SafeError } from "./connection-types";
import { GoogleApiError } from "./http";

/** Map any thrown error to a UI-safe shape (no tokens, headers or stack traces). */
export function toSafeError(err: unknown): SafeError {
  if (err instanceof TokenError) return { message: err.message, code: err.code, hint: err.hint };
  if (err instanceof EnvError) return { message: err.message, code: "env_invalid" };
  if (err instanceof GoogleApiError) {
    let hint: string | undefined;
    if (/has not been used|is disabled|SERVICE_DISABLED|accessNotConfigured/i.test(`${err.message} ${err.reason}`)) {
      hint =
        "Enable this API for the OAuth client's Google Cloud project (APIs & Services → Library), wait a few minutes, then re-check.";
    } else if (err.status === 403) {
      hint =
        "The Google account behind this refresh token lacks access. Grant it at least Viewer on the GA4 property / Search Console property.";
    } else if (err.status === 429) {
      hint = "Quota exhausted. Requests are retried with backoff; wait and re-check.";
    }
    return { message: err.message, code: err.reason ?? `http_${err.status}`, httpStatus: err.status, hint };
  }
  if (err instanceof Error && err.name === "TimeoutError") return { message: "Request timed out.", code: "timeout" };
  if (err instanceof Error && /SQLITE/i.test(err.message)) return { message: "Local database error.", code: "db" };
  return { message: "Unexpected error while loading data.", code: "unknown" };
}
