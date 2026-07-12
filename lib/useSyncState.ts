"use client";

import { useEffect, useState } from "react";
import type { SyncState } from "../shared/types/domain";
import { getApi } from "./ipc/client";

const POLL_MS = 5000;

export function useSyncState() {
  const [state, setState] = useState<SyncState | null>(null);

  useEffect(() => {
    let cancelled = false;
    const poll = () => {
      getApi()
        .sync.getState()
        .then((next) => {
          if (!cancelled) setState(next);
        });
    };
    poll();
    const id = setInterval(poll, POLL_MS);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, []);

  return state;
}
