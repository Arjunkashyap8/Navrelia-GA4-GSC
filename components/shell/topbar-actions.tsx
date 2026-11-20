"use client";

import { FileDown } from "lucide-react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Button } from "@/components/ui/button";

export function ExportPdfButton() {
  const params = useSearchParams();
  const q = new URLSearchParams(params.toString());
  return (
    <Button size="sm" asChild>
      <Link href={`/reports?${q.toString()}`}>
        <FileDown /> Export PDF
      </Link>
    </Button>
  );
}
