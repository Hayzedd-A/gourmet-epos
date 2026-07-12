import type { IpcMain } from "electron";
import { eq } from "drizzle-orm";
import type { getDb } from "../../db/client";
import { assembleSale } from "../../db/sales";
import { sale, staffCache } from "../../db/schema";
import { buildReceiptBuffer } from "../../hardware/receipt";
import { sendToPrinter } from "../../hardware/printer";
import { IPC_CHANNELS } from "../../../shared/types/ipc";

export function registerPrinterHandlers(ipcMain: IpcMain, db: ReturnType<typeof getDb>) {
  ipcMain.handle(IPC_CHANNELS.printerPrintReceipt, (_event, saleId: string): void => {
    const row = db.select().from(sale).where(eq(sale.id, saleId)).get();
    if (!row) {
      throw new Error("Sale not found");
    }
    const staff = db.select().from(staffCache).where(eq(staffCache.id, row.staffId)).get();

    const buffer = buildReceiptBuffer(assembleSale(db, row), staff?.name ?? "Staff");
    const result = sendToPrinter(buffer);
    if (!result.printed) {
      console.warn(`[printer] receipt for ${saleId} not printed: ${result.reason}`);
    }
  });
}
