import { NextResponse } from "next/server";
import { toSafeError } from "@/lib/google/connection";
import { isSyncRunning, lastSuccessfulSync, recentSyncRuns, runSync } from "@/lib/sync/sync";

export const runtime = "nodejs";
export const maxDuration = 60;
export const dynamic = "force-dynamic";

export async function GET() {
  return NextResponse.json({ running: isSyncRunning(), last: lastSuccessfulSync(), runs: recentSyncRuns(10) });
}

/** "Sync now". Body: { kind?: "backfill" | "incremental" }. */
export async function POST(req: Request) {
  const body = (await req.json().catch(() => ({}))) as { kind?: string };
  const force = body.kind === "backfill" || body.kind === "incremental" ? body.kind : undefined;
  try {
    const summary = await runSync({ force });
    return NextResponse.json({ ok: true, summary });
  } catch (err) {
    return NextResponse.json({ ok: false, error: toSafeError(err) }, { status: 500 });
  }
}
