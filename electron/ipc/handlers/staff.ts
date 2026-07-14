import { randomUUID } from "node:crypto";
import type { IpcMain } from "electron";
import { eq } from "drizzle-orm";
import { hashPin } from "../../auth/pin";
import type { getDb } from "../../db/client";
import { staffCache } from "../../db/schema";
import { getTerminalConfig } from "../../db/terminal";
import { appState } from "../../state";
import { canManageStaff } from "../../../shared/permissions";
import { IPC_CHANNELS } from "../../../shared/types/ipc";
import type { StaffInput, StaffMember } from "../../../shared/types/domain";

function requireSuperAdmin() {
  if (!canManageStaff(appState.session?.accessRole)) {
    throw new Error("Super admin access required");
  }
}

function toStaffMember(row: typeof staffCache.$inferSelect): StaffMember {
  return { id: row.id, name: row.name, accessRole: row.accessRole, hasPin: row.pinHash !== null };
}

export function registerStaffHandlers(ipcMain: IpcMain, db: ReturnType<typeof getDb>) {
  // Read-only name/role lookup — open to any logged-in role (e.g. the Sales
  // page resolves staff names for staff too, see docs/ARCHITECTURE.md §6).
  // Actually managing staff (create/update/delete below) stays super_admin-only.
  ipcMain.handle(IPC_CHANNELS.staffList, (): StaffMember[] => {
    if (!appState.session) {
      throw new Error("Not logged in");
    }
    return db.select().from(staffCache).all().map(toStaffMember);
  });

  // Local-only PIN accounts — never writes through to Zupa (see
  // docs/ARCHITECTURE.md). super_admin is never assigned here; it's inherent
  // to holding real Zupa admin credentials (see auth:loginSuperAdmin).
  ipcMain.handle(IPC_CHANNELS.staffCreate, (_event, input: StaffInput): StaffMember => {
    requireSuperAdmin();
    const config = getTerminalConfig(db);
    const row = {
      id: randomUUID(),
      name: input.name,
      pinHash: hashPin(input.pin, config.deviceSecret),
      accessRole: input.accessRole,
      updatedAt: Date.now(),
    };
    db.insert(staffCache).values(row).run();
    return toStaffMember(row);
  });

  ipcMain.handle(
    IPC_CHANNELS.staffUpdate,
    (_event, id: string, input: Partial<StaffInput>): StaffMember => {
      requireSuperAdmin();
      const existing = db.select().from(staffCache).where(eq(staffCache.id, id)).get();
      if (!existing) {
        throw new Error("Staff member not found");
      }
      if (existing.accessRole === "super_admin") {
        throw new Error("Super admins are managed via Zupa login, not here");
      }

      const config = getTerminalConfig(db);
      db.update(staffCache)
        .set({
          name: input.name ?? existing.name,
          accessRole: input.accessRole ?? existing.accessRole,
          pinHash: input.pin ? hashPin(input.pin, config.deviceSecret) : existing.pinHash,
          updatedAt: Date.now(),
        })
        .where(eq(staffCache.id, id))
        .run();

      const updated = db.select().from(staffCache).where(eq(staffCache.id, id)).get()!;
      return toStaffMember(updated);
    },
  );

  ipcMain.handle(IPC_CHANNELS.staffDelete, (_event, id: string): void => {
    requireSuperAdmin();
    const existing = db.select().from(staffCache).where(eq(staffCache.id, id)).get();
    if (existing?.accessRole === "super_admin") {
      throw new Error("Super admins are managed via Zupa login, not here");
    }
    db.delete(staffCache).where(eq(staffCache.id, id)).run();
  });
}
