import path from "node:path";
import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import { migrate } from "drizzle-orm/better-sqlite3/migrator";
import * as schema from "./schema";

let db: ReturnType<typeof drizzle<typeof schema>> | null = null;

/**
 * Opens (creating if needed) the terminal's local SQLite database and runs
 * any pending migrations. Must be called once from main.ts before any IPC
 * handler touches the database.
 */
export function initDb(userDataDir: string) {
  const dbPath = path.join(userDataDir, "epos.db");
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
