"use client";

import { CalendarRange, Download, ExternalLink, Loader2 } from "lucide-react";
import { useSearchParams } from "next/navigation";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { SHARED_KEYS } from "@/lib/filters";
import { REPORT_MODULES } from "@/lib/report-modules";

/** `serverPdf` false (e.g. on Vercel, which has no Chrome): PDF buttons open the printable report and the browser's Save as PDF. */
export function ReportBuilder({ serverPdf = true }: { serverPdf?: boolean }) {
  const params = useSearchParams();
  const [mods, setMods] = useState<Set<string>>(new Set(REPORT_MODULES.map((m) => m.id)));
  const [title, setTitle] = useState("Monthly performance report");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const query = (overrides: Record<string, string> = {}) => {
    const q = new URLSearchParams();
    SHARED_KEYS.forEach((k) => {
      const v = params.get(k);
      if (v) q.set(k, v);
    });
    q.set("modules", [...mods].join(","));
    q.set("title", title);
    Object.entries(overrides).forEach(([k, v]) => q.set(k, v));
    return q.toString();
  };

  const download = async (overrides: Record<string, string> = {}) => {
    if (!serverPdf) {
      window.open(`/report?${query({ ...overrides, print: "1" })}`, "_blank", "noopener");
      return;
    }
    setBusy(true);
    setErr(null);
    try {
      const res = await fetch(`/api/report-pdf?${query(overrides)}`);
      if (!res.ok) throw new Error(((await res.json().catch(() => null)) as { error?: { message: string } } | null)?.error?.message ?? `HTTP ${res.status}`);
      const blob = await res.blob();
      const a = document.createElement("a");
      a.href = URL.createObjectURL(blob);
      a.download = res.headers.get("content-disposition")?.match(/filename="([^"]+)"/)?.[1] ?? "navrelia-report.pdf";
      a.click();
      URL.revokeObjectURL(a.href);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "PDF failed");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-4">
      <label className="block max-w-md text-caption font-medium text-muted">
        Report title
        <input value={title} onChange={(e) => setTitle(e.target.value)} maxLength={80} className="mt-0.5 h-9 w-full rounded-lg border border-line bg-white px-2 text-body" />
      </label>
      <fieldset>
        <legend className="mb-1 text-caption font-medium text-muted">Sections</legend>
        <div className="grid gap-1.5 sm:grid-cols-2 lg:grid-cols-3">
          {REPORT_MODULES.map((m) => (
            <label key={m.id} className="flex items-center gap-2 text-body">
              <input
                type="checkbox"
                className="accent-brand-700"
                checked={mods.has(m.id)}
                disabled={"required" in m}
                onChange={(e) => {
                  const next = new Set(mods);
                  if (e.target.checked) next.add(m.id);
                  else next.delete(m.id);
                  setMods(next);
                }}
              />
              {m.label}
            </label>
          ))}
        </div>
      </fieldset>
      <p className="text-caption text-muted">
        Uses the date range, comparison and filters in the top bar.
        {!serverPdf && " The report opens in a new tab with the print dialog: choose “Save as PDF”."}
      </p>
      <div className="flex flex-wrap gap-2">
        <Button variant="primary" disabled={busy} onClick={() => download()}>
          {busy ? <Loader2 className="animate-spin" /> : <Download />} Download PDF
        </Button>
        <Button onClick={() => download({ range: "lastMonth", cmp: "previous", title: "Monthly client report" })} disabled={busy}>
          <CalendarRange /> Monthly client report (last month)
        </Button>
        <Button variant="ghost" asChild>
          <a href={`/report?${query()}`} target="_blank" rel="noopener">
            <ExternalLink /> Open printable report
          </a>
        </Button>
      </div>
      {busy && <p className="text-caption text-muted">Rendering the report… this takes 10–40 seconds the first time.</p>}
      {err && <p className="text-caption text-negative">{err}</p>}
    </div>
  );
}
