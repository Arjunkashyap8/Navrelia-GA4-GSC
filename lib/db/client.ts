import "server-only";
import { mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import Database from "better-sqlite3";
import { drizzle, type BetterSQLite3Database } from "drizzle-orm/better-sqlite3";
import { migrate } from "./migrate";
import * as schema from "./schema";
import { seedAnnotations } from "./seed";

// On Vercel only /tmp is writable, and it is wiped whenever the server is recycled.
const DB_PATH = resolve(process.env.DATABASE_PATH ?? (process.env.VERCEL ? "/tmp/navrelia.db" : "data/navrelia.db"));

interface DbHandles {
  sqlite: Database.Database;
  db: BetterSQLite3Database<typeof schema>;
}

const g = globalThis as unknown as { __navreliaDb?: DbHandles };

function open(): DbHandles {
  mkdirSync(dirname(DB_PATH), { recursive: true });
  const sqlite = new Database(DB_PATH);
  sqlite.pragma("journal_mode = WAL");
  sqlite.pragma("synchronous = NORMAL");
  sqlite.pragma("busy_timeout = 5000");
  migrate(sqlite);
  seedAnnotations(sqlite);
  return { sqlite, db: drizzle(sqlite, { schema }) };
}

export function getDb() {
  return (g.__navreliaDb ??= open()).db;
}

/** Raw handle for hand-written aggregate SQL (fast paths in lib/data). */
export function getSqlite() {
  return (g.__navreliaDb ??= open()).sqlite;
}

export { schema };
