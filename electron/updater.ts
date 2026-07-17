import { app, dialog, type BrowserWindow } from "electron";
import { autoUpdater } from "electron-updater";
import { zupaConfig } from "./zupa/config";

// Background auto-update — lets a new version reach every till without
// re-running the installer by hand on each machine. Never interrupts an
// active shift: the new version downloads silently, and only installs on
// an explicit "Restart now" or the next time the app naturally quits
// (autoInstallOnAppQuit) — never a forced mid-shift restart.
//
// Releases are still published straight to GitHub (electron-builder's
// `build.publish` config, used at build time by `electron-builder
// --publish`) — but at runtime the check is redirected (via `setFeedURL`
// below, in `startAutoUpdater`) through zupa-api's `/terminal-api/updates`
// proxy instead of hitting GitHub directly. That proxy holds the GitHub
// token server-side, so this app never carries a GitHub credential of its
// own — see docs/ARCHITECTURE.md and zupa-api's src/modules/terminal
// /index.js for why (the repo is moving to a private org repo, and an
// embedded token would be unrotatable without a working update path to
// deliver its own replacement).
autoUpdater.autoDownload = true;
autoUpdater.autoInstallOnAppQuit = true;

// A till can stay open all day, so a fix shipped mid-shift shouldn't have
// to wait for tomorrow's first launch.
const RECHECK_INTERVAL_MS = 4 * 60 * 60 * 1000;

let timer: ReturnType<typeof setInterval> | null = null;

async function checkNow(): Promise<void> {
  try {
    await autoUpdater.checkForUpdates();
  } catch (error) {
    // Best-effort, same as printing/sync — a failed update check (e.g. no
    // internet, GitHub unreachable) must never block the till from opening.
    console.error("[updater] checkForUpdates failed", error);
  }
}

/**
 * `apiKey` is `terminal_config.apiKey` — the same device credential every
 * other zupa-api call sends as `X-Terminal-Key` (see electron/zupa/client.ts).
 * Reused here so the update-check proxy can be gated the same way as the
 * rest of `/terminal-api/*`, with no separate credential to manage. Null
 * before activation — in that case, updates simply aren't checked until the
 * next restart after activating (not worth a live feed-URL refresh for a
 * till that isn't in use yet).
 */
export function startAutoUpdater(mainWindow: BrowserWindow, apiKey: string | null): void {
  if (timer || !app.isPackaged || !apiKey) {
    // Dev runs (`npm run dev`) have no packaged installer for electron-updater
    // to compare against — skip outright rather than log a harmless error
    // on every start.
    return;
  }

  autoUpdater.setFeedURL({
    provider: "generic",
    url: `${zupaConfig.baseUrl}/terminal-api/updates`,
    requestHeaders: { "x-terminal-key": apiKey },
  });

  autoUpdater.on("update-downloaded", (info) => {
    void dialog
      .showMessageBox(mainWindow, {
        type: "info",
        buttons: ["Restart now", "Later"],
        defaultId: 0,
        title: "Update ready",
        message: `Gourmet Twist EPOS ${info.version} has been downloaded.`,
        detail: "Restart now to apply it, or it will install automatically the next time the app closes.",
      })
      .then(({ response }) => {
        if (response === 0) autoUpdater.quitAndInstall();
      });
  });

  autoUpdater.on("error", (error) => {
    console.error("[updater] update failed", error);
  });

  void checkNow();
  timer = setInterval(() => void checkNow(), RECHECK_INTERVAL_MS);
}

export function stopAutoUpdater(): void {
  if (timer) clearInterval(timer);
  timer = null;
}
