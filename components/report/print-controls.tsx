"use client";

import { Printer } from "lucide-react";
import { useEffect } from "react";
import { Button } from "@/components/ui/button";

/** Marks the report ready for the PDF renderer once charts have drawn; optional auto-print. */
export function PrintControls({ autoPrint }: { autoPrint: boolean }) {
  useEffect(() => {
    // Ready when every chart figure has drawn its SVG (or after 10 s as a safety net).
    const started = Date.now();
    const t = setInterval(() => {
      const figures = document.querySelectorAll("figure[role=img]").length;
      const drawn = document.querySelectorAll("figure[role=img] svg").length;
      if ((figures > 0 && drawn >= figures && Date.now() - started > 800) || Date.now() - started > 10_000) {
        clearInterval(t);
        (window as unknown as { __reportReady?: boolean }).__reportReady = true;
        if (autoPrint) window.print();
      }
    }, 250);
    return () => clearInterval(t);
  }, [autoPrint]);
  return (
    <div className="no-print fixed right-4 top-4 z-50 flex gap-2">
      <Button variant="primary" onClick={() => window.print()}>
        <Printer /> Print / Save as PDF
      </Button>
    </div>
  );
}
