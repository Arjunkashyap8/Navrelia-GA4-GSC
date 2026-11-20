import { NextResponse } from "next/server";
import { getConnectionReport, toSafeError } from "@/lib/google/connection";

export const runtime = "nodejs";
export const maxDuration = 60;
export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const refresh = new URL(req.url).searchParams.get("refresh") === "1";
  try {
    const report = await getConnectionReport({ refresh });
    return NextResponse.json(report, { headers: { "cache-control": "no-store" } });
  } catch (err) {
    return NextResponse.json({ error: toSafeError(err) }, { status: 500 });
  }
}
