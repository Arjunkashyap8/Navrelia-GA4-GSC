"use client";

export async function settingsAction(body: Record<string, unknown>) {
  const res = await fetch("/api/settings", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
  const json = (await res.json().catch(() => ({}))) as { ok?: boolean; error?: { message: string } };
  if (!res.ok || !json.ok) throw new Error(json.error?.message ?? `HTTP ${res.status}`);
}
