"use client";

import { useQuery } from "@tanstack/react-query";
import { Pause, Play, RefreshCw } from "lucide-react";
import { useState } from "react";
import { BarChart } from "@/components/charts/bar-chart";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useFmt } from "@/components/ui/fmt";
import { Skeleton } from "@/components/ui/skeleton";

type Block = { rows: Record<string, string | number>[] } | { error: string };
interface Realtime {
  activeUsers: number | null;
  fetchedAt: number;
  error: string | null;
  pages: Block;
  sources: Block;
  countries: Block;
  cities: Block;
  devices: Block;
  events: Block;
  minutes: Block;
}

function List({ title, block, dim, metric = "activeUsers" }: { title: string; block?: Block; dim: string; metric?: string }) {
  const { fmt } = useFmt();
  const rows = block && "rows" in block ? block.rows : [];
  const max = Math.max(...rows.map((r) => Number(r[metric])), 1);
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-body">{title}</CardTitle>
      </CardHeader>
      <CardContent>
        {block && "error" in block ? (
          <p className="text-caption text-muted">Not available: {block.error}</p>
        ) : rows.length === 0 ? (
          <p className="text-caption text-muted">No activity right now.</p>
        ) : (
          <ul className="space-y-1.5">
            {rows.slice(0, 10).map((r) => (
              <li key={String(r[dim])} className="text-body">
                <div className="flex justify-between gap-3">
                  <span className="truncate">{String(r[dim]) || "(not set)"}</span>
                  <span className="num font-medium">{fmt(Number(r[metric]), "number")}</span>
                </div>
                <div className="mt-0.5 h-1 rounded-full bg-slate-100">
                  <div className="h-full rounded-full bg-brand-600/70" style={{ width: `${(Number(r[metric]) / max) * 100}%` }} />
                </div>
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}

export function RealtimeView() {
  const [paused, setPaused] = useState(false);
  const { data, isLoading, refetch, isFetching, dataUpdatedAt } = useQuery({
    queryKey: ["realtime"],
    queryFn: async () => (await (await fetch("/api/realtime")).json()) as Realtime,
    refetchInterval: paused ? false : 60_000,
    staleTime: 0,
  });

  const minutes = data && "rows" in data.minutes ? data.minutes.rows : [];
  const perMinute = Array.from({ length: 30 }, (_, i) => Number(minutes.find((r) => Number(r.minutesAgo) === 29 - i)?.activeUsers ?? 0));

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <Button onClick={() => setPaused(!paused)} aria-pressed={paused}>
          {paused ? <Play /> : <Pause />}
          {paused ? "Resume auto-refresh" : "Pause auto-refresh"}
        </Button>
        <Button variant="ghost" onClick={() => refetch()} disabled={isFetching}>
          <RefreshCw className={isFetching ? "animate-spin" : undefined} /> Refresh now
        </Button>
        <span className="text-caption text-muted" aria-live="polite">
          {paused ? "Paused" : "Refreshes every 60 s"}
          {dataUpdatedAt ? ` · updated ${new Date(dataUpdatedAt).toLocaleTimeString("en-IN", { timeZone: "Asia/Calcutta" })} IST` : ""}
        </span>
      </div>

      {isLoading ? (
        <Skeleton className="h-40 w-full" />
      ) : (
        <div className="grid gap-4 lg:grid-cols-[280px_minmax(0,1fr)]">
          <Card className="flex flex-col justify-center p-6">
            <p className="text-caption font-medium text-muted">Active users · last 30 minutes</p>
            <p className="num mt-1 text-5xl font-semibold text-ink" aria-live="polite">
              {data?.activeUsers ?? "—"}
            </p>
            {data?.error && <p className="mt-2 text-caption text-negative">{data.error}</p>}
          </Card>
          <Card className="p-4">
            <p className="mb-1 text-caption font-medium text-muted">Active users per minute (oldest → now)</p>
            <BarChart horizontal={false} height={170} label="Active users per minute" categories={perMinute.map((_, i) => `-${29 - i}m`)} series={[{ name: "Active users", data: perMinute }]} />
          </Card>
        </div>
      )}

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        <List title="Pages being viewed" block={data?.pages} dim="unifiedScreenName" />
        <List title="Traffic source (first user)" block={data?.sources} dim="firstUserSource" />
        <List title="Countries" block={data?.countries} dim="country" />
        <List title="Cities" block={data?.cities} dim="city" />
        <List title="Devices" block={data?.devices} dim="deviceCategory" />
        <List title="Events (last 30 min)" block={data?.events} dim="eventName" metric="eventCount" />
      </div>
    </div>
  );
}
