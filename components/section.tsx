import { AlertCircle } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { InfoTip } from "@/components/ui/tooltip";
import { toSafeError } from "@/lib/google/errors";
import { cn } from "@/lib/utils";

/** Card section with title, optional description and info tooltip. */
export function Section({
  title,
  description,
  info,
  actions,
  children,
  className,
  id,
}: {
  title: string;
  description?: React.ReactNode;
  info?: React.ReactNode;
  actions?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
  id?: string;
}) {
  return (
    <Card className={cn("min-w-0", className)} id={id}>
      <CardHeader>
        <div className="min-w-0">
          <CardTitle className="flex items-center gap-1.5">
            {title}
            {info && <InfoTip label={title}>{info}</InfoTip>}
          </CardTitle>
          {description && <CardDescription>{description}</CardDescription>}
        </div>
        {actions}
      </CardHeader>
      <CardContent>{children}</CardContent>
    </Card>
  );
}

/** Widget-level error state: says what failed, never crashes the page. */
export function SectionError({ what, error }: { what: string; error: unknown }) {
  const e = toSafeError(error);
  return (
    <div role="alert" className="flex gap-2 rounded-lg border border-red-200 bg-negative-soft px-3 py-3 text-body text-red-900">
      <AlertCircle className="mt-0.5 size-4 shrink-0" aria-hidden />
      <div>
        <p className="font-medium">Couldn&apos;t load {what}.</p>
        <p className="text-caption">{e.message}</p>
        {e.hint && <p className="mt-1 text-caption">{e.hint}</p>}
        <p className="mt-1 text-caption">Reload the page to retry; other sections are unaffected.</p>
      </div>
    </div>
  );
}

export { safe } from "@/lib/safe";

export function SectionSkeleton({ height = 280, title = true }: { height?: number; title?: boolean }) {
  return (
    <Card className="p-5" aria-busy="true">
      {title && <Skeleton className="mb-4 h-5 w-48" />}
      <Skeleton className="w-full" style={{ height } as React.CSSProperties} />
    </Card>
  );
}

export function PageSkeleton() {
  return (
    <div className="space-y-4" aria-busy="true" aria-label="Loading">
      <Skeleton className="h-24 w-full rounded-card" />
      <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
        {Array.from({ length: 6 }, (_, i) => (
          <Skeleton key={i} className="h-[148px] rounded-card" />
        ))}
      </div>
      <Skeleton className="h-[340px] w-full rounded-card" />
      <div className="grid gap-4 lg:grid-cols-2">
        <Skeleton className="h-[300px] rounded-card" />
        <Skeleton className="h-[300px] rounded-card" />
      </div>
    </div>
  );
}

export function Notice({ children, tone = "info" }: { children: React.ReactNode; tone?: "info" | "warning" }) {
  return (
    <div
      className={cn(
        "flex gap-2 rounded-lg border px-3 py-2 text-caption",
        tone === "info" ? "border-blue-200 bg-info-soft text-blue-900" : "border-amber-200 bg-warning-soft text-amber-900",
      )}
    >
      <AlertCircle className="mt-0.5 size-3.5 shrink-0" aria-hidden />
      <div>{children}</div>
    </div>
  );
}
