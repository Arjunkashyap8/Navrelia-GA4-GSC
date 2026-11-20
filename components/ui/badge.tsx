import { cva, type VariantProps } from "class-variance-authority";
import * as React from "react";
import { cn } from "@/lib/utils";

const badgeVariants = cva(
  "inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-caption font-medium [&_svg]:size-3.5",
  {
    variants: {
      tone: {
        neutral: "border-line bg-slate-50 text-slate-700",
        brand: "border-brand-100 bg-brand-50 text-brand-800",
        positive: "border-green-200 bg-positive-soft text-green-800",
        negative: "border-red-200 bg-negative-soft text-red-800",
        warning: "border-amber-200 bg-warning-soft text-amber-800",
        info: "border-blue-200 bg-info-soft text-blue-800",
      },
    },
    defaultVariants: { tone: "neutral" },
  },
);

export interface BadgeProps extends React.HTMLAttributes<HTMLSpanElement>, VariantProps<typeof badgeVariants> {}

export function Badge({ className, tone, ...props }: BadgeProps) {
  return <span className={cn(badgeVariants({ tone }), className)} {...props} />;
}
