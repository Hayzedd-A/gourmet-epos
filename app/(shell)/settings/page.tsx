"use client";

import { useState } from "react";
import { Button } from "@/components/ui/Button";
import { formatDateTime } from "@/lib/format";
import { getApi } from "@/lib/ipc/client";
import { useSyncState } from "@/lib/useSyncState";

export default function SettingsPage() {
  const syncState = useSyncState();
  const [syncing, setSyncing] = useState(false);

  async function syncNow() {
    setSyncing(true);
    try {
      await getApi().sync.triggerNow();
    } finally {
      setSyncing(false);
    }
  }

  return (
    <div className="h-full overflow-y-auto p-8">
      <div className="flex max-w-lg flex-col gap-8">
        <div>
          <h1 className="text-xl font-semibold text-ink">Settings</h1>
          <p className="text-sm text-muted">
            Sales and catalog updates sync in the background automatically. Anyone can trigger a sync manually
            from here.
          </p>
        </div>

        <div className="flex flex-col gap-4 rounded-[var(--radius-panel)] border border-border bg-surface p-5">
          <div className="flex items-center justify-between">
            <span className="text-sm font-medium text-ink">Terminal activation</span>
            <span
              className={`rounded-full px-2 py-0.5 text-xs font-medium ${
                syncState?.activated ? "bg-success/15 text-success" : "bg-muted/15 text-muted"
              }`}
            >
              {syncState?.activated ? "Activated" : "Not activated"}
            </span>
          </div>

          {syncState && (
            <dl className="grid grid-cols-2 gap-y-1 text-xs text-muted">
              <dt>Last catalog sync</dt>
              <dd className="text-right text-ink">
                {syncState.lastSyncedAt.catalog ? formatDateTime(syncState.lastSyncedAt.catalog) : "Never"}
              </dd>
              <dt>Pending sales</dt>
              <dd className="text-right text-ink">{syncState.pendingOutboxCount}</dd>
              {syncState.lastError && (
                <>
                  <dt>Last error</dt>
                  <dd className="text-right text-danger">{syncState.lastError}</dd>
                </>
              )}
            </dl>
          )}

          <Button onClick={syncNow} loading={syncing} className="self-start">
            Sync now
          </Button>
        </div>

        <div className="flex items-center justify-between rounded-[var(--radius-panel)] border border-border bg-surface p-5">
          <span className="text-sm font-medium text-ink">Super admin connection</span>
          <span
            className={`rounded-full px-2 py-0.5 text-xs font-medium ${
              syncState?.authenticated ? "bg-success/15 text-success" : "bg-muted/15 text-muted"
            }`}
          >
            {syncState?.authenticated ? "Connected" : "Not connected"}
          </span>
        </div>
      </div>
    </div>
  );
}
