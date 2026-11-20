export type Settled<T> = { ok: true; data: T } | { ok: false; error: unknown };

/** Run a loader and capture failure instead of throwing (one failed widget ≠ broken page). */
export async function safe<T>(fn: () => Promise<T>): Promise<Settled<T>> {
  try {
    return { ok: true, data: await fn() };
  } catch (error) {
    console.error("[widget]", error instanceof Error ? error.message : "unknown error");
    return { ok: false, error };
  }
}
