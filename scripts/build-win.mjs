#!/usr/bin/env node
// Builds the Windows target with a correctly-staged native `better-sqlite3`
// binary. Cross-compiling this from Linux is NOT automatic: @electron/rebuild
// refuses to cross-compile native modules from source (node-gyp doesn't
// support it), and simply running `electron-builder --win` packages
// whatever's currently sitting in node_modules/better-sqlite3 — which, on a
// dev machine, is normally the LOCAL platform's build (Linux). That silently
// produces a broken Windows installer (an ELF binary where Windows expects a
// PE DLL, which crashes the packaged app on launch with no error at all) —
// this happened for real once already. This script stages the real Windows
// prebuilt binary first (via prebuild-install, matching this project's
// Electron version) and restores the local dev build afterward no matter
// what, so a plain `electron-builder --win` can never quietly ship the wrong
// binary again. See docs/ARCHITECTURE.md §10.
import { execFileSync, execSync } from "node:child_process";
import { readFileSync, rmSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const projectRoot = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const betterSqlite3Dir = path.join(projectRoot, "node_modules", "better-sqlite3");
const { version: electronVersion } = JSON.parse(
  readFileSync(path.join(projectRoot, "node_modules", "electron", "package.json"), "utf8"),
);

function run(command, args, cwd) {
  console.log(`$ ${command} ${args.join(" ")}`);
  execFileSync(command, args, { cwd: cwd ?? projectRoot, stdio: "inherit" });
}

function restoreLocalNativeBuild() {
  console.log("\nRestoring local dev build of better-sqlite3 (this machine's Electron ABI)...");
  try {
    run("npx", ["electron-rebuild", "-f", "-w", "better-sqlite3"]);
  } catch (cause) {
    console.error(
      "WARNING: failed to restore the local dev build of better-sqlite3 — run " +
        "`npm run rebuild:native` before using `npm run dev` again.",
      cause.message,
    );
  }
}

try {
  run("npm", ["run", "build:next"]);
  run("npm", ["run", "build:electron"]);

  console.log(`\nStaging Windows x64 prebuilt better-sqlite3 for Electron ${electronVersion}...`);
  rmSync(path.join(betterSqlite3Dir, "build"), { recursive: true, force: true });
  run(
    "npx",
    [
      "prebuild-install",
      "--platform=win32",
      "--arch=x64",
      "--runtime=electron",
      `--target=${electronVersion}`,
    ],
    betterSqlite3Dir,
  );

  const nodeFile = path.join(betterSqlite3Dir, "build", "Release", "better_sqlite3.node");
  const fileType = execSync(`file "${nodeFile}"`).toString();
  if (!fileType.includes("PE32")) {
    throw new Error(`Staged better-sqlite3 binary is not a Windows PE file — got: ${fileType.trim()}`);
  }
  console.log("Confirmed: staged binary is a genuine Windows PE DLL.");

  run("npx", ["electron-builder", "--win", "--x64"]);
  console.log("\nWindows build complete — see release/.");
} finally {
  restoreLocalNativeBuild();
}
