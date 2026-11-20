import { connection } from "next/server";
import { Suspense } from "react";
import { DrillProvider } from "@/components/drill/drill-context";
import { DrillDrawer } from "@/components/drill/drill-drawer";
import { NavProvider } from "@/components/shell/nav-context";
import { Sidebar } from "@/components/shell/sidebar";
import { Topbar } from "@/components/shell/topbar";
import { NumberFormatProvider } from "@/components/ui/fmt";
import { Skeleton } from "@/components/ui/skeleton";
import { getSettings } from "@/lib/settings-store";
import { ensureSyncScheduler } from "@/lib/sync/scheduler";

/** Uncached pages make many Google API calls; allow up to 60 s (the free Vercel plan limit). */
export const maxDuration = 60;

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  // Read runtime env per request (not at build time), so the gate banner is always accurate.
  await connection();
  ensureSyncScheduler();
  const gateEnabled = Boolean(process.env.DASHBOARD_PASSWORD?.trim());
  const { numberSystem } = getSettings();
  return (
    <NumberFormatProvider system={numberSystem}>
      <DrillProvider>
        <NavProvider>
          <div className="flex min-h-screen">
            <Suspense fallback={<div className="hidden w-60 border-r border-line bg-white md:block" />}>
              <Sidebar gateEnabled={gateEnabled} />
            </Suspense>
            <div className="flex min-w-0 flex-1 flex-col">
              <Suspense fallback={<div className="h-[61px] border-b border-line bg-white px-8 py-3"><Skeleton className="h-9 w-80" /></div>}>
                <Topbar />
              </Suspense>
              <main className="mx-auto w-full max-w-content flex-1 px-4 py-6 md:px-6 lg:px-8">{children}</main>
            </div>
          </div>
          <Suspense>
            <DrillDrawer />
          </Suspense>
        </NavProvider>
      </DrillProvider>
    </NumberFormatProvider>
  );
}
