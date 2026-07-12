import { randomUUID } from "node:crypto";
import type { IpcMain } from "electron";
import { eq } from "drizzle-orm";
import type { getDb } from "../../db/client";
import { shift } from "../../db/schema";
import { getOpenShift } from "../../db/shifts";
import { getTerminalConfig } from "../../db/terminal";
import { appState } from "../../state";
import { IPC_CHANNELS } from "../../../shared/types/ipc";
import type { Shift } from "../../../shared/types/domain";

function requireSession() {
  if (!appState.session) {
    throw new Error("Not logged in");
  }
  return appState.session;
}

export function registerShiftHandlers(ipcMain: IpcMain, db: ReturnType<typeof getDb>) {
  ipcMain.handle(IPC_CHANNELS.shiftsOpen, (_event, openingFloat: number): Shift => {
    const session = requireSession();
    const config = getTerminalConfig(db);

    if (getOpenShift(db, config.terminalId)) {
      throw new Error("A shift is already open on this terminal");
    }

    const row: Shift = {
      id: randomUUID(),
      staffId: session.staffId,
      terminalId: config.terminalId,
      openedAt: Date.now(),
      closedAt: null,
      openingFloat,
      closingTotal: null,
    };
    db.insert(shift).values(row).run();
    appState.session = { ...session, shiftId: row.id };
    return row;
  });

  ipcMain.handle(IPC_CHANNELS.shiftsClose, (_event, closingTotal: number): Shift => {
    const session = requireSession();
    if (!session.shiftId) {
      throw new Error("No open shift for this session");
    }

    db.update(shift)
      .set({ closedAt: Date.now(), closingTotal })
      .where(eq(shift.id, session.shiftId))
      .run();

    const updated = db.select().from(shift).where(eq(shift.id, session.shiftId)).get();
    if (!updated) {
      throw new Error("Shift disappeared while closing it");
    }
    appState.session = { ...session, shiftId: null };
    return updated;
  });

  ipcMain.handle(IPC_CHANNELS.shiftsCurrent, (): Shift | null => {
    const config = getTerminalConfig(db);
    return getOpenShift(db, config.terminalId);
  });
}
