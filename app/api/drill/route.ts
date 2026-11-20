import { NextResponse } from "next/server";
import type { DrillType } from "@/components/drill/drill-context";
import { getViewContext } from "@/lib/data/context";
import { buildDrill } from "@/lib/data/drill";
import { toSafeError } from "@/lib/google/errors";

export const runtime = "nodejs";
export const maxDuration = 60;
export const dynamic = "force-dynamic";

const TYPES: DrillType[] = ["page", "query", "channel", "country", "device"];

export async function GET(req: Request) {
  const sp = Object.fromEntries(new URL(req.url).searchParams.entries());
  const type = sp.type as DrillType;
  const id = (sp.id ?? "").slice(0, 500);
  if (!TYPES.includes(type) || !id) {
    return NextResponse.json({ error: { message: "Invalid drill-down target." } }, { status: 400 });
  }
  try {
    return NextResponse.json(await buildDrill(getViewContext(sp), type, id));
  } catch (err) {
    return NextResponse.json({ error: toSafeError(err) }, { status: 500 });
  }
}
