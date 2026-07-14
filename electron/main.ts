// Must be the first import: loads .env into process.env before any other
// module (e.g. electron/zupa/config.ts) evaluates. Next.js's dev/build
// tooling loads .env automatically, but that only covers the renderer —
// this main process is a separate Node process (`electron .` running the
// bundled dist-electron/main.js) that nothing else loads .env for.
import "dotenv/config";
import path from "node:path";
import { app, BrowserWindow, ipcMain } from "electron";
import { initDb } from "./db/client";
import { seed } from "./db/seed";
import { registerAllHandlers } from "./ipc/handlers";
import { buildMenu } from "./menu";
import { getTerminalConfig } from "./db/terminal";
import { startSyncScheduler, stopSyncScheduler } from "./sync/engine";
import { startStaticServer, resolveOutDir } from "./staticServer";

const DEV_SERVER_URL = "http://localhost:7282";
const STATIC_SERVER_PORT = 41732;

let mainWindow: BrowserWindow | null = null;

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

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      void createWindow();
    }
  });
});

app.on("window-all-closed", () => {
  stopSyncScheduler();
  if (process.platform !== "darwin") {
    app.quit();
  }
});
