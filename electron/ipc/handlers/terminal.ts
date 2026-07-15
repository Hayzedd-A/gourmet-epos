import type { IpcMain } from "electron";
import { eq } from "drizzle-orm";
import type { getDb } from "../../db/client";
import { terminalConfig } from "../../db/schema";
import { getTerminalConfig } from "../../db/terminal";
import * as zupa from "../../zupa/client";
import { IPC_CHANNELS } from "../../../shared/types/ipc";
import type { TerminalStatus } from "../../../shared/types/domain";

function toStatus(config: ReturnType<typeof getTerminalConfig>): TerminalStatus {
  return {
    activated: config.apiKey !== null,
    storeId: config.storeId,
    displayName: config.displayName,
    storeAddress: config.storeAddress,
    storePhone: config.storePhone,
    storeEmail: config.storeEmail,
  };
}

export function registerTerminalHandlers(ipcMain: IpcMain, db: ReturnType<typeof getDb>) {
  ipcMain.handle(IPC_CHANNELS.terminalGetStatus, (): TerminalStatus => toStatus(getTerminalConfig(db)));

  // Purely local/cosmetic — printed on receipts as "Device". Any logged-in
  // role can set it (it's not a security-relevant setting).
  ipcMain.handle(IPC_CHANNELS.terminalUpdateDisplayName, (_event, displayName: string | null): TerminalStatus => {
    const trimmed = displayName?.trim() || null;
    db.update(terminalConfig).set({ displayName: trimmed }).where(eq(terminalConfig.id, "default")).run();
    return toStatus(getTerminalConfig(db));
  });

  // Printed on the receipt just after the store name — see
  // electron/hardware/receipt.ts. Any logged-in role can set it (not a
  // security-relevant setting, same as displayName above).
  ipcMain.handle(
    IPC_CHANNELS.terminalUpdateStoreInfo,
    (_event, input: { address: string | null; phone: string | null; email: string | null }): TerminalStatus => {
      db.update(terminalConfig)
        .set({
          storeAddress: input.address?.trim() || null,
          storePhone: input.phone?.trim() || null,
          storeEmail: input.email?.trim() || null,
        })
        .where(eq(terminalConfig.id, "default"))
        .run();
      return toStatus(getTerminalConfig(db));
    },
  );

  // No dedicated "validate key" endpoint exists — fetching the catalog is
  // the practical validation: a 401 means the key is invalid/inactive, and
  // success gives us the storeId (resolved server-side from the key) to
  // store locally. See docs/ARCHITECTURE.md §6.
  ipcMain.handle(IPC_CHANNELS.terminalActivate, async (_event, apiKey: string): Promise<TerminalStatus> => {
    const trimmed = apiKey.trim();
    if (!trimmed) {
      throw new Error("Enter an API key");
    }

    const result = await zupa.fetchTerminalProducts(trimmed, "all");

    db.update(terminalConfig)
      .set({ apiKey: trimmed, storeId: result.storeId })
      .where(eq(terminalConfig.id, "default"))
      .run();

    return toStatus(getTerminalConfig(db));
  });
}
