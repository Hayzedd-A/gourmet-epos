import type { IpcMain } from "electron";
import { eq } from "drizzle-orm";
import type { getDb } from "../../db/client";
import { terminalConfig } from "../../db/schema";
import { getTerminalConfig } from "../../db/terminal";
import * as zupa from "../../zupa/client";
import { IPC_CHANNELS } from "../../../shared/types/ipc";
import type { TerminalStatus } from "../../../shared/types/domain";

export function registerTerminalHandlers(ipcMain: IpcMain, db: ReturnType<typeof getDb>) {
  ipcMain.handle(IPC_CHANNELS.terminalGetStatus, (): TerminalStatus => {
    const config = getTerminalConfig(db);
    return { activated: config.apiKey !== null, storeId: config.storeId };
  });

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

    return { activated: true, storeId: result.storeId };
  });
}
