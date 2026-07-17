import { writeFileSync } from "node:fs";
import type { IpcMain } from "electron";
import { BrowserWindow, dialog } from "electron";
import { appState } from "../../state";
import { buildSalesCsv } from "../../reports/salesCsv";
import { canExportData } from "../../../shared/permissions";
import { IPC_CHANNELS } from "../../../shared/types/ipc";
import type { ExportResult, Sale } from "../../../shared/types/domain";

// A BOM so Excel (the realistic destination for this on Windows) opens the
// file as UTF-8 rather than guessing a system codepage and garbling
// anything non-ASCII — same reasoning as the printer script's BOM fix, see
// docs/ARCHITECTURE.md §10.
const UTF8_BOM = "﻿";

// No `db` param, unlike every other register*Handlers — this is the one
// handler that doesn't touch the database at all (the renderer already
// has the exact rows to export in hand; see shared/types/ipc.ts).
export function registerReportsHandlers(ipcMain: IpcMain) {
  ipcMain.handle(
    IPC_CHANNELS.reportsExportSalesCsv,
    async (
      _event,
      sales: Sale[],
      staffNames: Record<string, string>,
      defaultFileName: string,
    ): Promise<ExportResult> => {
      // The renderer only ever hands over sales it already legitimately
      // fetched (sales:list itself scopes staff to their own sales), so
      // this isn't a data-scoping check — it's the actual feature gate:
      // exporting is an admin/super_admin action, not just viewing.
      if (!canExportData(appState.session?.accessRole)) {
        throw new Error("Not permitted to export data");
      }

      const win = BrowserWindow.getAllWindows()[0];
      const { canceled, filePath } = await dialog.showSaveDialog(win, {
        title: "Export sales",
        defaultPath: defaultFileName,
        filters: [{ name: "CSV", extensions: ["csv"] }],
      });
      if (canceled || !filePath) {
        return { saved: false, path: null };
      }

      writeFileSync(filePath, UTF8_BOM + buildSalesCsv(sales, staffNames), "utf8");
      return { saved: true, path: filePath };
    },
  );
}
