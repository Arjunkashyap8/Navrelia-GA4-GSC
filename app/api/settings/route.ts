import { NextResponse } from "next/server";
import { z } from "zod";
import { clearCache } from "@/lib/cache";
import { getSqlite } from "@/lib/db/client";
import { getSettings, listAnnotations, listTargets, saveSettings, setTarget } from "@/lib/settings-store";
import { recentSyncRuns } from "@/lib/sync/sync";

export const runtime = "nodejs";
export const maxDuration = 60;
export const dynamic = "force-dynamic";

const iso = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);

const Action = z.discriminatedUnion("action", [
  z.object({
    action: z.literal("saveSettings"),
    brandTerms: z.array(z.string().trim().min(1).max(60)).max(30).optional(),
    groupRules: z.array(z.object({ name: z.string().trim().min(1).max(60), pattern: z.string().trim().min(1).max(200) })).max(50).optional(),
    numberSystem: z.enum(["indian", "international"]).optional(),
    showGoogleUpdates: z.boolean().optional(),
    digestEmail: z.union([z.string().email(), z.literal("")]).optional(),
  }),
  z.object({ action: z.literal("setTarget"), month: z.string().regex(/^\d{4}-\d{2}$/), metric: z.enum(["sessions", "keyEvents", "revenue", "organicClicks"]), value: z.number().nonnegative().nullable() }),
  z.object({ action: z.literal("addAnnotation"), date: iso, title: z.string().trim().min(1).max(120), note: z.string().max(500).optional(), category: z.enum(["launch", "campaign", "google_update", "tracking", "other"]) }),
  z.object({ action: z.literal("toggleAnnotation"), id: z.number().int(), enabled: z.boolean() }),
  z.object({ action: z.literal("deleteAnnotation"), id: z.number().int() }),
  z.object({ action: z.literal("saveView"), name: z.string().trim().min(1).max(80), path: z.string().startsWith("/").max(100), query: z.string().max(1000) }),
  z.object({ action: z.literal("deleteView"), id: z.number().int() }),
  z.object({ action: z.literal("clearCache") }),
]);

export async function GET() {
  return NextResponse.json({
    settings: getSettings(),
    targets: listTargets(),
    annotations: listAnnotations(undefined, true),
    views: getSqlite().prepare("SELECT id, name, path, query, created_at FROM saved_views ORDER BY name").all(),
    syncRuns: recentSyncRuns(8),
  });
}

export async function POST(req: Request) {
  const parsed = Action.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: { message: parsed.error.issues[0]?.message ?? "Invalid request." } }, { status: 400 });
  const a = parsed.data;
  const db = getSqlite();
  switch (a.action) {
    case "saveSettings": {
      const { action: _a, ...patch } = a;
      void _a;
      saveSettings(patch);
      if (patch.brandTerms) clearCache(); // brand filters are part of cached GSC requests
      break;
    }
    case "setTarget":
      setTarget(a.month, a.metric, a.value);
      break;
    case "addAnnotation":
      db.prepare("INSERT INTO annotations (date, title, note, category, source, enabled, created_at) VALUES (?, ?, ?, ?, 'user', 1, ?)").run(a.date, a.title, a.note ?? null, a.category, Date.now());
      break;
    case "toggleAnnotation":
      db.prepare("UPDATE annotations SET enabled = ? WHERE id = ?").run(a.enabled ? 1 : 0, a.id);
      break;
    case "deleteAnnotation":
      db.prepare("DELETE FROM annotations WHERE id = ? AND source = 'user'").run(a.id);
      break;
    case "saveView":
      db.prepare("INSERT INTO saved_views (name, path, query, created_at) VALUES (?, ?, ?, ?)").run(a.name, a.path, a.query, Date.now());
      break;
    case "deleteView":
      db.prepare("DELETE FROM saved_views WHERE id = ?").run(a.id);
      break;
    case "clearCache":
      clearCache();
      break;
  }
  return NextResponse.json({ ok: true });
}
