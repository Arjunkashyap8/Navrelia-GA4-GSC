"use client";

import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useCallback, useState } from "react";
import type { ConnectionReport, SafeError } from "@/lib/google/connection-types";

export const CONNECTION_KEY = ["connection"] as const;

async function fetchConnection(refresh: boolean): Promise<ConnectionReport> {
  const res = await fetch(`/api/connection${refresh ? "?refresh=1" : ""}`, { cache: "no-store" });
  if (res.status === 401) {
    window.location.href = `/login?next=${encodeURIComponent(window.location.pathname + window.location.search)}`;
    throw new Error("Session expired");
  }
  const json = (await res.json()) as ConnectionReport | { error: SafeError };
  if (!res.ok || "error" in json) {
    throw new Error("error" in json ? json.error.message : `HTTP ${res.status}`);
  }
  return json;
}

export function useConnection() {
  const qc = useQueryClient();
  const [rechecking, setRechecking] = useState(false);
  const query = useQuery({
    queryKey: CONNECTION_KEY,
    queryFn: () => fetchConnection(false),
    staleTime: 5 * 60_000,
  });
  const recheck = useCallback(async () => {
    setRechecking(true);
    try {
      qc.setQueryData(CONNECTION_KEY, await fetchConnection(true));
    } catch (err) {
      await qc.invalidateQueries({ queryKey: CONNECTION_KEY });
      throw err;
    } finally {
      setRechecking(false);
    }
  }, [qc]);
  return { ...query, recheck, rechecking };
}
