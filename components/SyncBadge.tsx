"use client";

import { useSyncState } from "../lib/useSyncState";

export function SyncBadge() {
  const state = useSyncState();

  if (!state) return null;

  const label = state.online
    ? state.pendingOutboxCount > 0
      ? `Syncing ${state.pendingOutboxCount}…`
      : "Synced"
    : "Offline — sales are saved locally";

  const dotClass = state.online
    ? state.pendingOutboxCount > 0
      ? "bg-warning"
      : "bg-success"
    : "bg-muted";

  return (
    <div
      className="flex items-center gap-2 rounded-full border border-border bg-surface px-3 py-1.5 text-xs text-muted"
      title={state.lastError ?? undefined}
    >
      <span className={`h-2 w-2 rounded-full ${dotClass}`} aria-hidden />
      {label}
    </div>
  );
}
