// Must be the first import: loads .env into process.env before any other
// module (e.g. electron/zupa/config.ts) evaluates. Next.js's dev/build
// tooling loads .env automatically, but that only covers the renderer —
// this main process is a separate Node process (`electron .` running the
// bundled dist-electron/main.js) that nothing else loads .env for.
import "dotenv/config";
import path from "node:path";
import { app, BrowserWindow, dialog, ipcMain } from "electron";
import { initDb } from "./db/client";
import { seed } from "./db/seed";
import { registerAllHandlers } from "./ipc/handlers";
import { buildMenu } from "./menu";
import { getTerminalConfig } from "./db/terminal";
import { startSyncScheduler, stopSyncScheduler } from "./sync/engine";
import { startStaticServer, resolveOutDir } from "./staticServer";
import { startAutoUpdater, stopAutoUpdater } from "./updater";

const DEV_SERVER_URL = "http://localhost:7282";
const STATIC_SERVER_PORT = 41732;

let mainWindow: BrowserWindow | null = null;

/**
 * Without this, a startup failure (e.g. a native module like better-sqlite3
 * failing to load) just kills the process silently — no window, no error,
 * nothing in the UI to explain why. `dialog.showErrorBox` works even before
 * a window exists, so this is the only way to surface a fatal error to
 * whoever's sitting at the till instead of a support call about "the app
 * doesn't open."
 */
function showFatalError(context: string, error: unknown): void {
  const detail = error instanceof Error ? (error.stack ?? error.message) : String(error);
  console.error(`[fatal] ${context}`, error);
  try {
    dialog.showErrorBox("Gourmet Twist EPOS failed to start", `${context}\n\n${detail}`);
  } catch {
    // Only reachable if Electron itself isn't ready enough for a dialog —
    // nothing else to do at that point.
  }
}

process.on("uncaughtException", (error) => {
  showFatalError("Unexpected error", error);
  app.quit();
});
process.on("unhandledRejection", (reason) => {
  showFatalError("Unexpected error", reason);
});

async function resolveStartUrl(): Promise<string> {
  if (!app.isPackaged) {
    return DEV_SERVER_URL;
  }
  return startStaticServer(resolveOutDir(app.getAppPath()), STATIC_SERVER_PORT);
}

// `build/icon.png` (packaged into `files` in package.json's electron-builder
// config, which also sets it as the packaged app/installer icon) — a single
// PNG is enough for the Linux taskbar/window icon set here; a proper .ico/
// .icns would be needed if this ever ships Windows/macOS installers.
function resolveIconPath(): string {
  return path.join(app.getAppPath(), "build", "icon.png");
}

async function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 800,
    icon: resolveIconPath(),
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });

  const startUrl = await resolveStartUrl();
  await mainWindow.loadURL(startUrl);

  if (!app.isPackaged) {
    mainWindow.webContents.openDevTools({ mode: "detach" });
  }

  mainWindow.on("closed", () => {
    mainWindow = null;
  });
}

app.whenReady().then(async () => {
  const db = initDb(app.getPath("userData"));
  seed(db);

  registerAllHandlers(ipcMain, db);
  // Synchronous by design: preload.ts reads this once via sendSync, before
  // the page paints, so the correct theme applies with no flash.
  ipcMain.on("theme:getSync", (event) => {
    event.returnValue = getTerminalConfig(db).theme;
  });
  startSyncScheduler(db);

  await createWindow();
  buildMenu(db, mainWindow!);
  startAutoUpdater(mainWindow!, getTerminalConfig(db).apiKey);

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      void createWindow();
    }
  });
}).catch((error) => {
  showFatalError("Failed during startup", error);
  app.quit();
});

app.on("window-all-closed", () => {
  stopSyncScheduler();
  stopAutoUpdater();
  if (process.platform !== "darwin") {
    app.quit();
  }
});
