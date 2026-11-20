import type { Metadata } from "next";
import { RealtimeView } from "@/components/realtime/realtime-view";

export const metadata: Metadata = { title: "Realtime" };

export default function RealtimePage() {
  return (
    <div className="space-y-4">
      <p className="text-body text-muted">Live activity from GA4&apos;s realtime API. The date range and filters don&apos;t apply here.</p>
      <RealtimeView />
    </div>
  );
}
