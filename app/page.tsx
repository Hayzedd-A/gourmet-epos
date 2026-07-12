"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { PinPad } from "../components/PinPad";
import { SuperAdminLoginForm } from "../components/SuperAdminLoginForm";
import { SyncBadge } from "../components/SyncBadge";
import { useSession } from "../lib/session";
import { getApi } from "../lib/ipc/client";

type Tab = "pin" | "superAdmin";

export default function LoginPage() {
  const router = useRouter();
  const { session, loading, refresh } = useSession();
  const [tab, setTab] = useState<Tab>("pin");

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

  if (loading || session) {
    return null;
  }

  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-8 bg-bg px-6">
      <div className="flex flex-col items-center gap-1 text-center">
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
