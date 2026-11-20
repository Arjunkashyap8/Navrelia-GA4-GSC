import type Database from "better-sqlite3";

/**
 * Known Google Search ranking updates (start dates), seeded as optional, toggleable annotations.
 * Source: Google Search Status Dashboard. Users can disable any of them in Settings.
 */
export const GOOGLE_UPDATES: { date: string; title: string }[] = [
  { date: "2024-03-05", title: "March 2024 core update + spam update" },
  { date: "2024-05-06", title: "Site reputation abuse policy enforcement" },
  { date: "2024-06-20", title: "June 2024 spam update" },
  { date: "2024-08-15", title: "August 2024 core update" },
  { date: "2024-11-11", title: "November 2024 core update" },
  { date: "2024-12-12", title: "December 2024 core update" },
  { date: "2024-12-19", title: "December 2024 spam update" },
  { date: "2025-03-13", title: "March 2025 core update" },
  { date: "2025-06-30", title: "June 2025 core update" },
  { date: "2025-08-26", title: "August 2025 spam update" },
];

export function seedAnnotations(db: Database.Database) {
  const has = db.prepare("SELECT 1 FROM annotations WHERE source = 'seed' AND title = ? AND date = ?");
  const ins = db.prepare(
    "INSERT INTO annotations (date, title, note, category, source, enabled, created_at) VALUES (?, ?, ?, 'google_update', 'seed', 1, ?)",
  );
  const now = Date.now();
  const tx = db.transaction(() => {
    for (const u of GOOGLE_UPDATES) {
      if (!has.get(u.title, u.date)) ins.run(u.date, u.title, "Google Search ranking update (rollout start).", now);
    }
  });
  tx();
}
