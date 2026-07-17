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

  // Validates the key against POST /terminal-api/auth/validate, which also
  // binds it to this install's deviceId (electron/db/schema.ts) on first
  // use — a 403 here means the key is already bound to a *different*
  // device (DeviceMismatchError, see electron/zupa/client.ts), which
  // propagates as a plain error message to whoever called this.
  //
  // This same handler doubles as the "revalidate this device" recovery
  // path — it's not gated behind "not yet activated", so re-calling it
  // later (e.g. after a device-auth error surfaced elsewhere, or with a
  // freshly rotated key) works the same way as first activation. See
  // docs/ARCHITECTURE.md §6.
  ipcMain.handle(IPC_CHANNELS.terminalActivate, async (_event, apiKey: string): Promise<TerminalStatus> => {
    const trimmed = apiKey.trim();
    if (!trimmed) {
      throw new Error("Enter an API key");
    }

    const { deviceId } = getTerminalConfig(db);
    if (!deviceId) {
      throw new Error("This terminal has no device id yet — restart the app and try again");
    }

    const result = await zupa.validateTerminal({ apiKey: trimmed, deviceId });

    db.update(terminalConfig)
      .set({ apiKey: trimmed, storeId: result.terminal.storeId })
      .where(eq(terminalConfig.id, "default"))
      .run();

    return toStatus(getTerminalConfig(db));
  });
}
