import { randomBytes } from "node:crypto";
import { copyFileSync, existsSync, mkdirSync, readdirSync, statSync, unlinkSync } from "node:fs";
import path from "node:path";

const KEEP_BACKUPS = 10;

/**
 * Best-effort snapshot of the db (+ WAL/SHM sidecar files, so a crash
 * mid-checkpoint doesn't leave a torn backup) into `userDataDir/backups/`
 * before every migration attempt. This is the recovery path if a future
 * migration ever fails against a real deployed install — copy the newest
 * `epos.db*.bak` set back over `epos.db`(-wal/-shm) with the app closed to
 * restore exactly the pre-migration state. Never throws — a failed backup
 * shouldn't block startup, though it's logged loudly since silently
 * skipping it would defeat the point. No-ops on a fresh install (nothing to
 * back up yet).
 */
export function backupDatabaseIfExists(userDataDir: string, dbFileName = "epos.db"): void {
  const dbPath = path.join(userDataDir, dbFileName);
  if (!existsSync(dbPath)) {
    return;
  }

  try {
    const backupsDir = path.join(userDataDir, "backups");
    mkdirSync(backupsDir, { recursive: true });

    // A random suffix, not just the timestamp, guarantees a unique filename
    // even if this ever runs twice within the same millisecond (confirmed
    // to actually happen under rapid successive calls, e.g. in tests) —
    // a collision would otherwise silently overwrite an existing backup
    // instead of adding a new one.
    const stamp = `${new Date().toISOString().replace(/[:.]/g, "-")}-${randomBytes(3).toString("hex")}`;
    for (const suffix of ["", "-wal", "-shm"]) {
      const source = `${dbPath}${suffix}`;
      if (existsSync(source)) {
        copyFileSync(source, path.join(backupsDir, `${dbFileName}${suffix}.${stamp}.bak`));
      }
    }

    pruneOldBackups(backupsDir, dbFileName);
  } catch (cause) {
    console.error("[db] failed to back up database before migrating — continuing anyway", cause);
  }
}

function pruneOldBackups(backupsDir: string, dbFileName: string): void {
  const mainBackupPrefix = `${dbFileName}.`;
  const mainBackups = readdirSync(backupsDir)
    .filter((f) => f.startsWith(mainBackupPrefix) && f.endsWith(".bak"))
    .map((f) => ({ name: f, mtime: statSync(path.join(backupsDir, f)).mtimeMs }))
    .sort((a, b) => b.mtime - a.mtime);

  for (const stale of mainBackups.slice(KEEP_BACKUPS)) {
    const stamp = stale.name.slice(mainBackupPrefix.length, -".bak".length);
    for (const suffix of ["", "-wal", "-shm"]) {
      const file = path.join(backupsDir, `${dbFileName}${suffix}.${stamp}.bak`);
      if (existsSync(file)) unlinkSync(file);
    }
  }
}
