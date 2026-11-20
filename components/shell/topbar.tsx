"use client";

import { usePathname } from "next/navigation";
import { navItemFor } from "@/lib/nav";
import { FilterPanel } from "./filter-panel";
import { FreshnessBadge } from "./freshness-badge";
import { PageHeader } from "./page-header";
import { ExportPdfButton } from "./topbar-actions";

/**
 * Page header (title, data-delay badge, summary, quick ranges, date picker) followed by the
 * period + filter panel. Pages the filters don't affect (Settings, Realtime) show the header
 * and actions only.
 */
export function Topbar() {
  const pathname = usePathname();
  const item = navItemFor(pathname);
  const showPanel = item?.filters !== false;
  const actions = (
    <>
      <FreshnessBadge />
      {showPanel && <ExportPdfButton />}
    </>
  );

  return (
    <header className="border-b border-line bg-white">
      <div className="mx-auto max-w-content space-y-4 px-4 py-4 md:px-6 lg:px-8">
        <PageHeader item={item} />
        {showPanel ? (
          <FilterPanel source={item?.source ?? "both"} actions={actions} />
        ) : (
          <div className="flex flex-wrap items-center gap-2">{actions}</div>
        )}
      </div>
    </header>
  );
}
