import type { IpcMain } from "electron";
import { eq } from "drizzle-orm";
import type { getDb } from "../../db/client";
import { assembleSale } from "../../db/sales";
import { sale, staffCache, terminalConfig } from "../../db/schema";
import { getTerminalConfig } from "../../db/terminal";
import { buildReceiptBuffer, buildTestPrintBuffer, LINE_WIDTH, SAMPLE_RECEIPT_REFERENCE, STORE_NAME } from "../../hardware/receipt";
import { LOGO_PREVIEW_PNG_BASE64 } from "../../hardware/logo";
import { getPrinterConfig, listPrinters, sendToPrinter } from "../../hardware/printer";
import { IPC_CHANNELS } from "../../../shared/types/ipc";
import type { DiscoveredPrinter, PrinterResult, PrinterStatus, ReceiptPreviewAssets } from "../../../shared/types/domain";

export function registerPrinterHandlers(ipcMain: IpcMain, db: ReturnType<typeof getDb>) {
  ipcMain.handle(IPC_CHANNELS.printerPrintReceipt, async (_event, saleId: string): Promise<void> => {
    const row = db.select().from(sale).where(eq(sale.id, saleId)).get();
    if (!row) {
      throw new Error("Sale not found");
    }
    const staff = db.select().from(staffCache).where(eq(staffCache.id, row.staffId)).get();
    const config = getTerminalConfig(db);

    const buffer = buildReceiptBuffer(assembleSale(db, row), staff?.name ?? "Staff", config.displayName, {
      address: config.storeAddress,
      phone: config.storePhone,
      email: config.storeEmail,
    });
    const result = await sendToPrinter(buffer, config.printerName);
    if (!result.printed) {
      console.warn(`[printer] receipt for ${saleId} not printed: ${result.reason}`);
    }
  });

  ipcMain.handle(IPC_CHANNELS.printerGetStatus, (): PrinterStatus => {
    const config = getTerminalConfig(db);
    const { platform, target } = getPrinterConfig(config.printerName);
    return { platform, target, configured: target !== null };
  });

  ipcMain.handle(IPC_CHANNELS.printerTestPrint, async (): Promise<PrinterResult> => {
    const config = getTerminalConfig(db);
    const buffer = buildTestPrintBuffer({
      address: config.storeAddress,
      phone: config.storePhone,
      email: config.storeEmail,
    });
    return sendToPrinter(buffer, config.printerName);
  });

  ipcMain.handle(IPC_CHANNELS.printerListPrinters, (): Promise<DiscoveredPrinter[]> => listPrinters());

  ipcMain.handle(IPC_CHANNELS.printerSetPrinterName, (_event, printerName: string | null): PrinterStatus => {
    db.update(terminalConfig).set({ printerName }).where(eq(terminalConfig.id, "default")).run();
    const config = getTerminalConfig(db);
    const status = getPrinterConfig(config.printerName);
    return { ...status, configured: status.target !== null };
  });

  ipcMain.handle(IPC_CHANNELS.printerGetReceiptPreviewAssets, (): ReceiptPreviewAssets => ({
    storeName: STORE_NAME,
    logoPngDataUrl: `data:image/png;base64,${LOGO_PREVIEW_PNG_BASE64}`,
    sampleReference: SAMPLE_RECEIPT_REFERENCE,
    lineWidth: LINE_WIDTH,
  }));
}
