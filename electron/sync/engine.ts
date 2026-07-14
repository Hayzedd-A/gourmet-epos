import type { getDb } from "../db/client";
import { outbox, syncMeta } from "../db/schema";
import { getTerminalConfig } from "../db/terminal";
import { drainOutbox } from "./push";
import { pullCatalog, pullPaymentMethods } from "./pull";
import { isOnline } from "./network";
import type { SyncState } from "../../shared/types/domain";

const runtimeState = {
  online: false,
  lastError: null as string | null,
};

const POLL_INTERVAL_MS = 30_000;
let timer: ReturnType<typeof setInterval> | null = null;

export async function runSyncOnce(db: ReturnType<typeof getDb>): Promise<void> {
  const online = await isOnline();
  runtimeState.online = online;
  if (!online) return;

  try {
    await drainOutbox(db);
    await pullCatalog(db);
    await pullPaymentMethods(db);
    runtimeState.lastError = null;
  } catch (cause) {
    runtimeState.lastError = (cause as Error).message;
  }
}

export function startSyncScheduler(db: ReturnType<typeof getDb>) {
  if (timer) return;
  void runSyncOnce(db);
  timer = setInterval(() => void runSyncOnce(db), POLL_INTERVAL_MS);
}

export function stopSyncScheduler() {
  if (timer) clearInterval(timer);
  timer = null;
}

export function getSyncState(db: ReturnType<typeof getDb>): SyncState {
  const pendingOutboxCount = db.select().from(outbox).all().length;
  const metaRows = db.select().from(syncMeta).all();
  const lastSyncedAt: SyncState["lastSyncedAt"] = {};
  for (const row of metaRows) {
    lastSyncedAt[row.resource] = row.lastSyncedAt;
  }

  const config = getTerminalConfig(db);
  return {
    online: runtimeState.online,
    pendingOutboxCount,
    lastSyncedAt,
    lastError: runtimeState.lastError,
    activated: config.apiKey !== null,
    authenticated: config.jwt !== null,
  };
}
