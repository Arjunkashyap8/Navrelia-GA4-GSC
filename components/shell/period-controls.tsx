"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useMemo } from "react";
import { parsePeriodParams, todayInTimeZone } from "@/lib/metrics/periods";

const REPORT_TZ = "Asia/Calcutta";

/** Reads/writes the shareable period + filter state in the URL query string. */
export function usePeriod() {
  const params = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();
  const today = todayInTimeZone(REPORT_TZ);
  const period = useMemo(() => parsePeriodParams(params, today), [params, today]);

  const update = (patch: Record<string, string | null>) => {
    const next = new URLSearchParams(params.toString());
    Object.entries(patch).forEach(([k, v]) => (v === null ? next.delete(k) : next.set(k, v)));
    router.replace(`${pathname}?${next.toString()}`, { scroll: false });
  };

  return { period, today, update };
}
