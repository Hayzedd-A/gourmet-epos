import path from "node:path";
import { app, BrowserWindow, ipcMain } from "electron";
import { initDb } from "./db/client";
import { seed } from "./db/seed";
import { registerAllHandlers } from "./ipc/handlers";
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

async function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 800,
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
  startSyncScheduler(db);

  await createWindow();

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
