import type { IpcMain } from "electron";
import { eq } from "drizzle-orm";
import { verifyPin } from "../../auth/pin";
import type { getDb } from "../../db/client";
import { getOpenShift } from "../../db/shifts";
import { staffCache, terminalConfig } from "../../db/schema";
import { getTerminalConfig } from "../../db/terminal";
import { appState } from "../../state";
import * as zupa from "../../zupa/client";
import { IPC_CHANNELS } from "../../../shared/types/ipc";
import type { Session } from "../../../shared/types/domain";

function deriveName(user: zupa.ZupaLoginResponse["user"]): string {
  const fromParts = [user.firstName, user.lastName].filter(Boolean).join(" ").trim();
  return fromParts || user.email || "Super Admin";
}

export function registerAuthHandlers(ipcMain: IpcMain, db: ReturnType<typeof getDb>) {
  ipcMain.handle(IPC_CHANNELS.authLoginPin, (_event, pin: string): Session => {
    const config = getTerminalConfig(db);
    // super_admin rows have no PIN — they only ever authenticate via
    // auth:loginSuperAdmin, so they're never candidates here.
    const candidates = db.select().from(staffCache).all().filter((c) => c.pinHash);
    const match = candidates.find((c) => verifyPin(pin, config.deviceSecret, c.pinHash!));
    if (!match) {
      throw new Error("Incorrect PIN");
    }

    const openShift = getOpenShift(db, config.terminalId);
    const session: Session = {
      staffId: match.id,
      name: match.name,
      accessRole: match.accessRole,
      shiftId: openShift?.id ?? null,
    };
    appState.session = session;
    return session;
  });

  ipcMain.handle(IPC_CHANNELS.authGetSession, (): Session | null => appState.session);

  ipcMain.handle(IPC_CHANNELS.authLogout, () => {
    appState.session = null;
  });

  // The super admin's only login path — real Zupa email/password, not a
  // PIN. As a side effect this also (re)sets the terminal's Zupa sync
  // credential, but that's incidental to logging in, not the point of it:
  // background sync and manual "sync now" both work regardless of who (if
  // anyone) is currently logged in — see electron/sync/engine.ts.
  ipcMain.handle(
    IPC_CHANNELS.authLoginSuperAdmin,
    async (_event, email: string, password: string): Promise<Session> => {
      const result = await zupa.login(email, password);
      if (!result.accessRole) {
        // `isStore: false` makes Zupa populate `accessRole` only when the
        // account is a registered store administrator — its absence means
        // this is some other kind of Zupa account (customer, rider, ...).
        throw new Error("This Zupa account is not a store administrator");
      }

      db.update(terminalConfig).set({ jwt: result.jwt }).where(eq(terminalConfig.id, "default")).run();

      const name = deriveName(result.user);
      const now = Date.now();
      db.insert(staffCache)
        .values({ id: result.user.id, name, accessRole: "super_admin", pinHash: null, updatedAt: now })
        .onConflictDoUpdate({ target: staffCache.id, set: { name, updatedAt: now } })
        .run();

      const config = getTerminalConfig(db);
      const openShift = getOpenShift(db, config.terminalId);
      const session: Session = {
        staffId: result.user.id,
        name,
        accessRole: "super_admin",
        shiftId: openShift?.id ?? null,
      };
      appState.session = session;
      return session;
    },
  );
}
