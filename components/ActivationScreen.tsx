"use client";

import { useState } from "react";
import { Button } from "./ui/Button";

interface ActivationScreenProps {
  onActivate: (apiKey: string) => Promise<void>;
}

export function ActivationScreen({ onActivate }: ActivationScreenProps) {
  const [apiKey, setApiKey] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit() {
    setSubmitting(true);
    setError(null);
    try {
      await onActivate(apiKey.trim());
    } catch (cause) {
      setError((cause as Error).message);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-6 bg-bg px-6">
      <div className="flex flex-col items-center gap-2 text-center">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/logo.png" alt="Gourmet Twist" className="h-16 w-16 rounded-full" />
        <h1 className="text-2xl font-semibold tracking-tight text-ink">Activate this terminal</h1>
        <p className="max-w-sm text-sm text-muted">
          Enter the API key generated when this device was registered in Zupa. It&apos;s shown only once at
          registration — ask a store admin if you don&apos;t have it.
        </p>
      </div>

      <form
        className="flex w-full max-w-sm flex-col gap-4"
        onSubmit={(e) => {
          e.preventDefault();
          void submit();
        }}
      >
        <label className="flex flex-col gap-1.5 text-sm">
          <span className="text-muted">Terminal API key</span>
          <input
            autoFocus
            value={apiKey}
            onChange={(e) => setApiKey(e.target.value)}
            className="font-figures h-12 rounded-[var(--radius-control)] border border-border bg-surface px-3 text-ink focus-visible:outline focus-visible:outline-2 focus-visible:outline-primary"
          />
        </label>

        <p className="h-5 text-sm text-danger" role="alert">
          {error}
        </p>

        <Button type="submit" size="lg" className="w-full" loading={submitting} disabled={!apiKey.trim()}>
          Activate
        </Button>
      </form>
    </main>
  );
}
