"use client";

import { createContext, useCallback, useContext, useEffect, useState } from "react";
import type { Session } from "../shared/types/domain";
import { getApi } from "./ipc/client";

interface SessionContextValue {
  session: Session | null;
  loading: boolean;
  refresh: () => Promise<void>;
  logout: () => Promise<void>;
}

const SessionContext = createContext<SessionContextValue | null>(null);

export function SessionProvider({ children }: { children: React.ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    const current = await getApi().auth.getSession();
    setSession(current);
  }, []);

  useEffect(() => {
    let cancelled = false;
    getApi()
      .auth.getSession()
      .then((current) => {
        if (cancelled) return;
        setSession(current);
        setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const logout = useCallback(async () => {
    await getApi().auth.logout();
    setSession(null);
  }, []);

  return (
    <SessionContext.Provider value={{ session, loading, refresh, logout }}>
      {children}
    </SessionContext.Provider>
  );
}

export function useSession() {
  const ctx = useContext(SessionContext);
  if (!ctx) throw new Error("useSession must be used within SessionProvider");
  return ctx;
}
