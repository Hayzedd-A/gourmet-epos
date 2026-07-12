import type { IpcMain } from "electron";
import type { getDb } from "../../db/client";
import { registerAuthHandlers } from "./auth";
import { registerShiftHandlers } from "./shifts";
import { registerCatalogHandlers } from "./catalog";
import { registerSalesHandlers } from "./sales";
import { registerSyncHandlers } from "./sync";
import { registerPrinterHandlers } from "./printer";
import { registerStaffHandlers } from "./staff";

export function registerAllHandlers(ipcMain: IpcMain, db: ReturnType<typeof getDb>) {
  registerAuthHandlers(ipcMain, db);
  registerShiftHandlers(ipcMain, db);
  registerCatalogHandlers(ipcMain, db);
  registerSalesHandlers(ipcMain, db);
  registerSyncHandlers(ipcMain, db);
  registerPrinterHandlers(ipcMain, db);
  registerStaffHandlers(ipcMain, db);
}
