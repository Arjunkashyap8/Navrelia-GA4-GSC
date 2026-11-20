"use client";

import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Loader2, RefreshCw, Trash2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { settingsAction } from "@/lib/client/settings-api";
import { addMonths, todayInTimeZone } from "@/lib/metrics/periods";

interface Data {
  settings: { brandTerms: string[]; groupRules: { name: string; pattern: string }[]; numberSystem: "indian" | "international"; showGoogleUpdates: boolean; digestEmail: string };
  targets: { month: string; metric: string; value: number }[];
  annotations: { id: number; date: string; title: string; category: string; source: string; enabled: number }[];
  syncRuns: { id: number; kind: string; status: string; started_at: number; finished_at: number | null; detail: string | null; error: string | null }[];
}

const input = "h-9 w-full rounded-lg border border-line bg-white px-2 text-body focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-600";
const METRICS = [
  { id: "sessions", label: "Sessions" },
  { id: "keyEvents", label: "Key events" },
  { id: "revenue", label: "Revenue (₹)" },
  { id: "organicClicks", label: "Organic clicks" },
];

function Block({ title, description, children }: { title: string; description?: string; children: React.ReactNode }) {
  return (
    <Card>
      <CardHeader>
        <div>
          <CardTitle>{title}</CardTitle>
          {description && <CardDescription>{description}</CardDescription>}
        </div>
      </CardHeader>
      <CardContent>{children}</CardContent>
    </Card>
  );
}

const ist = (ms: number) => new Date(ms).toLocaleString("en-IN", { timeZone: "Asia/Calcutta", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });

export function SettingsPanel() {
  const qc = useQueryClient();
  const router = useRouter();
  const { data, refetch } = useQuery({ queryKey: ["settings"], queryFn: async () => (await (await fetch("/api/settings")).json()) as Data });
  const [prefs, setPrefs] = useState({ brand: "", rules: "", numberSystem: "indian", showGoogleUpdates: true, digestEmail: "" });
  const [msg, setMsg] = useState<string | null>(null);
  const [syncing, setSyncing] = useState(false);
  const month = todayInTimeZone("Asia/Calcutta").slice(0, 7);
  const months = [month, addMonths(`${month}-01`, 1).slice(0, 7)];

  useEffect(() => {
    if (!data) return;
    setPrefs({
      brand: data.settings.brandTerms.join(", "),
      rules: data.settings.groupRules.map((r) => `${r.name} = ${r.pattern}`).join("\n"),
      numberSystem: data.settings.numberSystem,
      showGoogleUpdates: data.settings.showGoogleUpdates,
      digestEmail: data.settings.digestEmail,
    });
  }, [data]);

  const run = async (fn: () => Promise<void>, ok: string) => {
    setMsg(null);
    try {
      await fn();
      setMsg(ok);
      await qc.invalidateQueries({ queryKey: ["settings"] });
      router.refresh();
    } catch (e) {
      setMsg(e instanceof Error ? e.message : "Failed");
    }
  };

  if (!data) return <p className="text-body text-muted">Loading settings…</p>;

  return (
    <div className="space-y-4">
      {msg && (
        <p role="status" className="rounded-lg bg-brand-50 px-3 py-2 text-body text-brand-800">
          {msg}
        </p>
      )}
      <div className="grid gap-4 xl:grid-cols-2">
        <Block title="Preferences">
          <form
            className="space-y-3"
            onSubmit={(e) => {
              e.preventDefault();
              void run(
                () =>
                  settingsAction({
                    action: "saveSettings",
                    brandTerms: prefs.brand.split(",").map((s) => s.trim()).filter(Boolean),
                    numberSystem: prefs.numberSystem,
                    showGoogleUpdates: prefs.showGoogleUpdates,
                    digestEmail: prefs.digestEmail.trim(),
                  }),
                "Preferences saved.",
              );
            }}
          >
            <label className="block text-caption font-medium text-muted">
              Brand terms (comma-separated, used for brand vs non-brand)
              <input className={input} value={prefs.brand} onChange={(e) => setPrefs({ ...prefs, brand: e.target.value })} />
            </label>
            <fieldset className="text-caption font-medium text-muted">
              <legend>Number format</legend>
              <div className="mt-1 flex gap-4 text-body text-ink">
                {[
                  ["indian", "Indian (12,34,567 · 12.3 L · 1.2 Cr)"],
                  ["international", "International (1,234,567 · 1.2M)"],
                ].map(([id, label]) => (
                  <label key={id} className="flex items-center gap-1.5">
                    <input type="radio" name="numfmt" className="accent-brand-700" checked={prefs.numberSystem === id} onChange={() => setPrefs({ ...prefs, numberSystem: id! })} />
                    {label}
                  </label>
                ))}
              </div>
            </fieldset>
            <label className="flex items-center gap-2 text-body text-ink">
              <input type="checkbox" className="accent-brand-700" checked={prefs.showGoogleUpdates} onChange={(e) => setPrefs({ ...prefs, showGoogleUpdates: e.target.checked })} />
              Show Google algorithm updates on charts
            </label>
            <label className="block text-caption font-medium text-muted">
              Weekly digest recipient (used by /api/digest)
              <input type="email" className={input} value={prefs.digestEmail} onChange={(e) => setPrefs({ ...prefs, digestEmail: e.target.value })} placeholder="name@example.com" />
            </label>
            <Button type="submit" variant="primary" size="sm">
              Save preferences
            </Button>
          </form>
        </Block>

        <Block title="URL grouping rules" description="One rule per line: Name = /path-prefix  or  Name = /regex/. Unmatched pages group by first directory.">
          <form
            className="space-y-3"
            onSubmit={(e) => {
              e.preventDefault();
              const groupRules = prefs.rules
                .split("\n")
                .map((l) => l.split("="))
                .filter((p) => p.length >= 2)
                .map(([n, ...rest]) => ({ name: n!.trim(), pattern: rest.join("=").trim() }))
                .filter((r) => r.name && r.pattern);
              void run(() => settingsAction({ action: "saveSettings", groupRules }), `Saved ${groupRules.length} grouping rules.`);
            }}
          >
            <textarea rows={6} className={`${input} h-auto py-2 font-mono text-[13px]`} value={prefs.rules} onChange={(e) => setPrefs({ ...prefs, rules: e.target.value })} placeholder={"Products = /products/\nRecipes = /blogs/recipes\nBlog = /blogs/"} />
            <Button type="submit" variant="primary" size="sm">
              Save rules
            </Button>
          </form>
        </Block>

        <Block title="Monthly targets" description="KPI cards show progress and a run-rate projection for the current month.">
          <table className="w-full text-body">
            <thead className="text-caption text-muted">
              <tr>
                <th className="py-1 text-left font-medium">Metric</th>
                {months.map((m) => (
                  <th key={m} className="py-1 text-left font-medium">
                    {m}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {METRICS.map((m) => (
                <tr key={m.id}>
                  <td className="py-1 pr-2">{m.label}</td>
                  {months.map((mo) => {
                    const cur = data.targets.find((t) => t.month === mo && t.metric === m.id)?.value;
                    return (
                      <td key={mo} className="py-1 pr-2">
                        <input
                          type="number"
                          min={0}
                          aria-label={`${m.label} target for ${mo}`}
                          defaultValue={cur ?? ""}
                          className={`${input} num`}
                          onBlur={(e) => {
                            const v = e.target.value === "" ? null : Number(e.target.value);
                            if (v === (cur ?? null)) return;
                            void run(() => settingsAction({ action: "setTarget", month: mo, metric: m.id, value: v }), "Target saved.");
                          }}
                        />
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
          <p className="mt-2 text-caption text-muted">Leave blank for no target. Saves when you leave the field.</p>
        </Block>

        <Block title="Data sync" description="Background sync runs every 6 hours. The first run backfills 16 months.">
          <div className="mb-3 flex flex-wrap gap-2">
            <Button
              variant="primary"
              size="sm"
              disabled={syncing}
              onClick={async () => {
                setSyncing(true);
                await run(async () => {
                  const r = await fetch("/api/sync", { method: "POST", headers: { "content-type": "application/json" }, body: "{}" });
                  if (!r.ok) throw new Error(((await r.json()) as { error?: { message: string } }).error?.message ?? "Sync failed");
                }, "Sync finished.");
                setSyncing(false);
                void refetch();
              }}
            >
              {syncing ? <Loader2 className="animate-spin" /> : <RefreshCw />} Sync now
            </Button>
            <Button size="sm" onClick={() => void run(() => settingsAction({ action: "clearCache" }), "Response cache cleared.")}>
              Clear response cache
            </Button>
          </div>
          <ul className="divide-y divide-line text-caption">
            {data.syncRuns.map((r) => {
              const detail = r.detail ? (JSON.parse(r.detail) as { rows?: Record<string, number> }) : null;
              return (
                <li key={r.id} className="flex flex-wrap items-center gap-2 py-1.5">
                  <Badge tone={r.status === "ok" ? "positive" : r.status === "error" ? "negative" : "warning"}>{r.status}</Badge>
                  <span className="font-medium">{r.kind}</span>
                  <span className="text-muted">{ist(r.started_at)}</span>
                  {r.finished_at && <span className="text-muted">· {Math.round((r.finished_at - r.started_at) / 1000)}s</span>}
                  {detail?.rows && <span className="num text-muted">· {Object.entries(detail.rows).map(([k, v]) => `${k} ${v.toLocaleString("en-IN")}`).join(", ")}</span>}
                  {r.error && <span className="text-negative">{r.error}</span>}
                </li>
              );
            })}
          </ul>
        </Block>
      </div>

      <Block title="Annotations" description="Date-pinned notes shown on every time-series chart. Add new ones below. Google updates are pre-seeded and can be switched off.">
        <ul className="max-h-80 divide-y divide-line overflow-y-auto">
          {data.annotations.map((a) => (
            <li key={a.id} className="flex items-center gap-3 py-1.5 text-body">
              <input
                type="checkbox"
                className="accent-brand-700"
                aria-label={`Show ${a.title}`}
                checked={Boolean(a.enabled)}
                onChange={(e) => void run(() => settingsAction({ action: "toggleAnnotation", id: a.id, enabled: e.target.checked }), "Annotation updated.")}
              />
              <span className="num w-24 shrink-0 text-muted">{a.date}</span>
              <span className="flex-1">{a.title}</span>
              <Badge tone={a.category === "google_update" ? "info" : "neutral"}>{a.category.replace("_", " ")}</Badge>
              {a.source === "user" && (
                <button type="button" aria-label={`Delete ${a.title}`} className="rounded p-1 text-muted hover:text-negative" onClick={() => void run(() => settingsAction({ action: "deleteAnnotation", id: a.id }), "Annotation deleted.")}>
                  <Trash2 className="size-4" />
                </button>
              )}
            </li>
          ))}
        </ul>
      </Block>
    </div>
  );
}
