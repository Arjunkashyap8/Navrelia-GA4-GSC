"use client";

import { LogOut, PanelLeftClose, PanelLeftOpen, X } from "lucide-react";
import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { useEffect } from "react";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { SHARED_KEYS } from "@/lib/filters";
import { NAV } from "@/lib/nav";
import { cn } from "@/lib/utils";
import { useNav } from "./nav-context";

/** Query params that carry across modules (date range, comparison, filters). */
const SHARED_PARAMS = SHARED_KEYS;

function NavLinks({ collapsed, onNavigate }: { collapsed: boolean; onNavigate?: () => void }) {
  const pathname = usePathname();
  const params = useSearchParams();
  const carry = new URLSearchParams();
  SHARED_PARAMS.forEach((k) => {
    const v = params.get(k);
    if (v) carry.set(k, v);
  });
  const qs = carry.toString();

  return (
    <nav aria-label="Modules" className="flex-1 overflow-y-auto px-3 py-2">
      {NAV.map((group) => (
        <div key={group.label} className="mb-4">
          {!collapsed && (
            <p className="flex items-center gap-1.5 px-2 pb-1.5 text-[11px] font-semibold uppercase tracking-wider text-slate-400">
              {group.label}
              {group.tag && (
                <span
                  className={cn(
                    "rounded px-1.5 py-px text-[10px] normal-case tracking-normal",
                    group.tag === "GA4" && "bg-orange-50 text-orange-700",
                    group.tag === "GSC" && "bg-blue-50 text-blue-700",
                    group.tag === "GA4 + GSC" && "bg-brand-50 text-brand-800",
                  )}
                >
                  {group.tag}
                </span>
              )}
            </p>
          )}
          {collapsed && group.tag && <div className="mx-auto my-1 h-px w-6 bg-line" aria-hidden />}
          <ul className="space-y-0.5">
            {group.items.map((item) => {
              const active = pathname === item.href || pathname.startsWith(`${item.href}/`);
              const Icon = item.icon;
              const link = (
                <Link
                  href={qs ? `${item.href}?${qs}` : item.href}
                  onClick={onNavigate}
                  aria-current={active ? "page" : undefined}
                  aria-label={collapsed ? item.label : undefined}
                  className={cn(
                    "flex h-9 items-center gap-2.5 rounded-lg px-2.5 text-body font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-600",
                    active ? "bg-brand-50 text-brand-800" : "text-slate-600 hover:bg-slate-100 hover:text-ink",
                    collapsed && "justify-center px-0",
                  )}
                >
                  <Icon className={cn("size-[18px] shrink-0", active ? "text-brand-700" : "text-slate-400")} aria-hidden />
                  {!collapsed && <span className="truncate">{item.label}</span>}
                </Link>
              );
              return (
                <li key={item.href}>
                  {collapsed ? (
                    <Tooltip>
                      <TooltipTrigger asChild>{link}</TooltipTrigger>
                      <TooltipContent side="right">{item.label}</TooltipContent>
                    </Tooltip>
                  ) : (
                    link
                  )}
                </li>
              );
            })}
          </ul>
        </div>
      ))}
    </nav>
  );
}

function Brand({ collapsed }: { collapsed: boolean }) {
  return (
    <div className={cn("flex h-16 items-center gap-2.5 px-5", collapsed && "justify-center px-0")}>
      <div className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-brand-700 text-sm font-bold text-white">
        N
      </div>
      {!collapsed && (
        <div className="leading-tight">
          <p className="text-body font-semibold text-ink">Navrelia</p>
          <p className="text-caption text-muted">Command Center</p>
        </div>
      )}
    </div>
  );
}

async function logout() {
  await fetch("/api/auth/logout", { method: "POST" });
  window.location.href = "/login";
}

export function Sidebar({ gateEnabled }: { gateEnabled: boolean }) {
  const { collapsed, setCollapsed, mobileOpen, setMobileOpen } = useNav();
  const pathname = usePathname();

  useEffect(() => setMobileOpen(false), [pathname, setMobileOpen]);

  return (
    <>
      {/* Desktop / tablet */}
      <aside
        className={cn(
          "sticky top-0 hidden h-screen shrink-0 flex-col border-r border-line bg-white transition-[width] duration-200 md:flex",
          collapsed ? "w-16" : "w-60",
        )}
      >
        <Brand collapsed={collapsed} />
        <NavLinks collapsed={collapsed} />
        <div className={cn("flex border-t border-line p-3", collapsed ? "flex-col items-center gap-1" : "items-center justify-between")}>
          {gateEnabled && (
            <button
              type="button"
              onClick={logout}
              className="inline-flex h-8 items-center gap-2 rounded-lg px-2 text-caption font-medium text-muted hover:bg-slate-100 hover:text-ink"
              aria-label="Sign out"
            >
              <LogOut className="size-4" aria-hidden />
              {!collapsed && "Sign out"}
            </button>
          )}
          <button
            type="button"
            onClick={() => setCollapsed(!collapsed)}
            className="inline-flex size-8 items-center justify-center rounded-lg text-muted hover:bg-slate-100 hover:text-ink"
            aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
          >
            {collapsed ? <PanelLeftOpen className="size-4" /> : <PanelLeftClose className="size-4" />}
          </button>
        </div>
      </aside>

      {/* Mobile drawer */}
      {mobileOpen && (
        <div className="fixed inset-0 z-40 md:hidden" role="dialog" aria-modal="true" aria-label="Navigation">
          <button
            type="button"
            className="absolute inset-0 bg-slate-900/30"
            aria-label="Close navigation"
            onClick={() => setMobileOpen(false)}
          />
          <aside className="absolute inset-y-0 left-0 flex w-72 flex-col bg-white shadow-xl">
            <div className="flex items-center justify-between pr-3">
              <Brand collapsed={false} />
              <button
                type="button"
                onClick={() => setMobileOpen(false)}
                className="inline-flex size-9 items-center justify-center rounded-lg text-muted hover:bg-slate-100"
                aria-label="Close navigation"
              >
                <X className="size-5" />
              </button>
            </div>
            <NavLinks collapsed={false} onNavigate={() => setMobileOpen(false)} />
          </aside>
        </div>
      )}
    </>
  );
}
