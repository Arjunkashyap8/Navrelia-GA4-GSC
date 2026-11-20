import "server-only";
import { getGoogleCredentials } from "@/lib/env";
import { runSync } from "./sync";

/**
 * In-process scheduler: first sync ~5 s after the server first renders a page, then every 6 hours.
 * Started lazily from the dashboard layout (so it runs in the server bundle where `server-only`
 * modules are allowed). Guarded on globalThis so dev hot reloads don't create duplicates.
 * For multi-instance deploys, disable with SYNC_SCHEDULER=off and call POST /api/sync from cron.
 */

const INTERVAL_MS = 6 * 60 * 60_000;
const g = globalThis as unknown as { __navreliaScheduler?: boolean };

export function ensureSyncScheduler() {
  // Serverless (Vercel) freezes between requests, so a timer would never run reliably.
  if (g.__navreliaScheduler || process.env.SYNC_SCHEDULER === "off" || process.env.VERCEL) return;
  if (!getGoogleCredentials("ga4").ok || !getGoogleCredentials("gsc").ok) return;
  g.__navreliaScheduler = true;
  const tick = () =>
    runSync().catch((err: unknown) => {
      console.error("[sync] failed:", err instanceof Error ? err.message : "unknown error");
    });
  setTimeout(tick, 5_000).unref?.();
  setInterval(tick, INTERVAL_MS).unref?.();
}
