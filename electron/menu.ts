import { app, BrowserWindow, Menu } from "electron";
import { eq } from "drizzle-orm";
import type { getDb } from "./db/client";
import { terminalConfig } from "./db/schema";
import { getTerminalConfig } from "./db/terminal";

type Theme = "light" | "dark";

const isMac = process.platform === "darwin";

function setTheme(db: ReturnType<typeof getDb>, window: BrowserWindow, theme: Theme) {
  db.update(terminalConfig).set({ theme }).where(eq(terminalConfig.id, "default")).run();
  window.webContents.send("theme:changed", theme);
  buildMenu(db, window); // rebuild so the radio-button checked state reflects the new theme
}

/** Sets the app's native menu, including the View menu's theme switcher. */
export function buildMenu(db: ReturnType<typeof getDb>, window: BrowserWindow): void {
  const theme = getTerminalConfig(db).theme;

  const template: Electron.MenuItemConstructorOptions[] = [
    ...(isMac
      ? [
          {
            label: app.name,
            submenu: [
              { role: "about" as const },
              { type: "separator" as const },
              { role: "hide" as const },
              { role: "hideOthers" as const },
              { role: "unhide" as const },
              { type: "separator" as const },
              { role: "quit" as const },
            ],
          },
        ]
      : []),
    {
      label: "File",
      submenu: [isMac ? { role: "close" as const } : { role: "quit" as const }],
    },
    {
      label: "Edit",
      submenu: [
        { role: "undo" as const },
        { role: "redo" as const },
        { type: "separator" as const },
        { role: "cut" as const },
        { role: "copy" as const },
        { role: "paste" as const },
        { role: "selectAll" as const },
      ],
    },
    {
      label: "View",
      submenu: [
        {
          label: "Light",
          type: "radio",
          checked: theme === "light",
          click: () => setTheme(db, window, "light"),
        },
        {
          label: "Dark",
          type: "radio",
          checked: theme === "dark",
          click: () => setTheme(db, window, "dark"),
        },
        { type: "separator" },
        { role: "reload" },
        { role: "forceReload" },
        { role: "toggleDevTools" },
        { type: "separator" },
        { role: "resetZoom" },
        { role: "zoomIn" },
        { role: "zoomOut" },
        { type: "separator" },
        { role: "togglefullscreen" },
      ],
    },
    {
      label: "Window",
      submenu: [{ role: "minimize" as const }, { role: "close" as const }],
    },
  ];

  Menu.setApplicationMenu(Menu.buildFromTemplate(template));
}
