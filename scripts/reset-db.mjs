#!/usr/bin/env node
// Deletes this terminal's local SQLite database so it's recreated fresh on
// next launch (fresh migrations + reseed). Needed whenever a schema change
// invalidates a dev database's migration history — see docs/ARCHITECTURE.md.
import { existsSync, readFileSync, rmSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const projectRoot = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const { name: APP_NAME } = JSON.parse(readFileSync(path.join(projectRoot, "package.json"), "utf8"));

function userDataDir() {
  switch (process.platform) {
    case "darwin":
      return path.join(os.homedir(), "Library", "Application Support", APP_NAME);
    case "win32":
      return path.join(process.env.APPDATA ?? path.join(os.homedir(), "AppData", "Roaming"), APP_NAME);
    default:
      return path.join(os.homedir(), ".config", APP_NAME);
  }
}

const dir = userDataDir();
const files = ["epos.db", "epos.db-wal", "epos.db-shm"].map((f) => path.join(dir, f));

let removed = 0;
for (const file of files) {
  if (existsSync(file)) {
    rmSync(file);
    removed += 1;
  }
}

console.log(removed > 0 ? `Removed ${removed} file(s) from ${dir}` : `Nothing to remove in ${dir}`);
