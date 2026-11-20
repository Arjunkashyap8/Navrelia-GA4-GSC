"use client";

import { createContext, useContext, useState } from "react";

export type DrillType = "page" | "query" | "channel" | "country" | "device";
export interface DrillTarget {
  type: DrillType;
  id: string;
}

const Ctx = createContext<{ target: DrillTarget | null; open: (t: DrillTarget) => void; close: () => void } | null>(null);

export function DrillProvider({ children }: { children: React.ReactNode }) {
  const [target, setTarget] = useState<DrillTarget | null>(null);
  return <Ctx.Provider value={{ target, open: setTarget, close: () => setTarget(null) }}>{children}</Ctx.Provider>;
}

export function useDrill() {
  const c = useContext(Ctx);
  // Outside the dashboard (e.g. report print view) drill-down is a no-op.
  return c ?? { target: null, open: () => undefined, close: () => undefined };
}
