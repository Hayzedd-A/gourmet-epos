"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { ActivationScreen } from "../components/ActivationScreen";
import { PinPad } from "../components/PinPad";
import { SuperAdminLoginForm } from "../components/SuperAdminLoginForm";
import { SyncBadge } from "../components/SyncBadge";
import { useSession } from "../lib/session";
import { getApi } from "../lib/ipc/client";
import type { TerminalStatus } from "../shared/types/domain";

type Tab = "pin" | "superAdmin";

export default function LoginPage() {
  const router = useRouter();
  const { session, loading, refresh } = useSession();
  const [tab, setTab] = useState<Tab>("pin");
  const [terminalStatus, setTerminalStatus] = useState<TerminalStatus | null>(null);

  useEffect(() => {
    let cancelled = false;
    getApi()
      .terminal.getStatus()
      .then((status) => {
        if (!cancelled) setTerminalStatus(status);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!loading && session) {
      router.replace("/pos");
    }
  }, [loading, session, router]);

  async function handlePinSubmit(pin: string) {
    await getApi().auth.loginPin(pin);
    await refresh();
  }

  async function handleSuperAdminSubmit(email: string, password: string) {
    await getApi().auth.loginSuperAdmin(email, password);
    await refresh();
  }

  async function handleActivate(apiKey: string) {
    const status = await getApi().terminal.activate(apiKey);
    setTerminalStatus(status);
  }

  // Hard gate: nothing else works before this terminal is activated — see
  // docs/ARCHITECTURE.md §6.
  if (terminalStatus === null) {
    return null;
  }
  if (!terminalStatus.activated) {
    return <ActivationScreen onActivate={handleActivate} />;
  }

  if (loading || session) {
    return null;
  }

  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-8 bg-bg px-6">
      <div className="flex flex-col items-center gap-2 text-center">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/logo.png" alt="Gourmet Twist" className="h-16 w-16 rounded-full" />
        <h1 className="text-2xl font-semibold tracking-tight text-ink">Gourmet Twist</h1>
        <p className="text-sm text-muted">
          {tab === "pin" ? "Enter your PIN to start" : "Sign in with your Zupa account"}
        </p>
      </div>

      <div className="flex rounded-full border border-border bg-surface p-1 text-sm">
        <button
          onClick={() => setTab("pin")}
          className={`rounded-full px-4 py-1.5 font-medium transition-colors ${
            tab === "pin" ? "bg-primary text-primary-ink" : "text-muted hover:text-ink"
          }`}
        >
          Staff / Admin
        </button>
        <button
          onClick={() => setTab("superAdmin")}
          className={`rounded-full px-4 py-1.5 font-medium transition-colors ${
            tab === "superAdmin" ? "bg-primary text-primary-ink" : "text-muted hover:text-ink"
          }`}
        >
          Super Admin
        </button>
      </div>

      {tab === "pin" ? (
        <PinPad onSubmit={handlePinSubmit} />
      ) : (
        <SuperAdminLoginForm onSubmit={handleSuperAdminSubmit} />
      )}

      <div className="fixed bottom-6 right-6">
        <SyncBadge />
      </div>
    </main>
  );
}
