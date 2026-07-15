import path from "node:path";
import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import { migrate } from "drizzle-orm/better-sqlite3/migrator";
import { backupDatabaseIfExists } from "./backup";
import * as schema from "./schema";

let db: ReturnType<typeof drizzle<typeof schema>> | null = null;

/**
 * Opens (creating if needed) the terminal's local SQLite database and runs
 * any pending migrations. Must be called once from main.ts before any IPC
 * handler touches the database.
 *
 * Backs up the existing db (if any) before migrating — see
 * `backupDatabaseIfExists` and docs/ARCHITECTURE.md §4.3. Migrations
 * themselves must only ever be *added to* going forward
 * (`npm run db:generate`), never regenerated/squashed — a real deployed
 * install's migration bookkeeping won't recognize a replaced baseline as
 * already-applied and will try to recreate every table from scratch,
 * crashing against tables that already exist. That's a real incident this
 * app already had once; the backup here is the safety net if it (or
 * anything else) ever corrupts a migration again.
 */
export function initDb(userDataDir: string) {
  const dbPath = path.join(userDataDir, "epos.db");
  backupDatabaseIfExists(userDataDir);

  const sqlite = new Database(dbPath);
  sqlite.pragma("journal_mode = WAL");
  sqlite.pragma("foreign_keys = ON");

  db = drizzle(sqlite, { schema });
  migrate(db, { migrationsFolder: path.join(__dirname, "migrations") });

  return db;
}

export function getDb() {
  if (!db) {
    throw new Error("Database not initialized — call initDb() first");
  }
  return db;
}
