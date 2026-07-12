import type { IpcMain } from "electron";
import type { getDb } from "../../db/client";
import { getSyncState, runSyncOnce } from "../../sync/engine";
import { IPC_CHANNELS } from "../../../shared/types/ipc";
import type { SyncState } from "../../../shared/types/domain";

export function registerSyncHandlers(ipcMain: IpcMain, db: ReturnType<typeof getDb>) {
  ipcMain.handle(IPC_CHANNELS.syncGetState, (): SyncState => getSyncState(db));

  ipcMain.handle(IPC_CHANNELS.syncTriggerNow, async (): Promise<SyncState> => {
    await runSyncOnce(db);
    return getSyncState(db);
  });
}
