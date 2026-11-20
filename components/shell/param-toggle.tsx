"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { cn } from "@/lib/utils";

/** Segmented control bound to one URL query parameter (first option = default, removes the param). */
export function ParamToggle({ param, options, label }: { param: string; options: { id: string; label: string }[]; label: string }) {
  const params = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();
  const value = params.get(param) ?? options[0]!.id;
  return (
    <div role="group" aria-label={label} className="inline-flex h-8 rounded-lg border border-line bg-white p-0.5">
      {options.map((o, i) => (
        <button
          key={o.id}
          type="button"
          aria-pressed={value === o.id}
          onClick={() => {
            const next = new URLSearchParams(params.toString());
            if (i === 0) next.delete(param);
            else next.set(param, o.id);
            router.replace(`${pathname}?${next.toString()}`, { scroll: false });
          }}
          className={cn("rounded-md px-2.5 text-caption font-medium", value === o.id ? "bg-brand-50 text-brand-800" : "text-muted hover:text-ink")}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}
