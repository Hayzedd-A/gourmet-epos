"use client";

import { useState } from "react";
import { Button } from "../ui/Button";

interface OpenShiftGateProps {
  onOpen: (openingFloat: number) => Promise<void>;
}

export function OpenShiftGate({ onOpen }: OpenShiftGateProps) {
  const [float, setFloat] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit() {
    setSubmitting(true);
    setError(null);
    try {
      await onOpen(Number(float) || 0);
    } catch (cause) {
      setError((cause as Error).message);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="flex h-full flex-col items-center justify-center gap-6 bg-bg px-6">
      <div className="flex flex-col items-center gap-1 text-center">
        <h1 className="text-xl font-semibold text-ink">Open your shift</h1>
        <p className="text-sm text-muted">Enter the opening cash float to start selling</p>
      </div>

      <label className="flex w-full max-w-xs flex-col gap-1.5 text-sm">
        <span className="text-muted">Opening float (₦)</span>
        <input
          type="number"
          min={0}
          autoFocus
          value={float}
          onChange={(e) => setFloat(e.target.value)}
          className="font-figures h-12 rounded-[var(--radius-control)] border border-border bg-surface px-3 text-base text-ink focus-visible:outline focus-visible:outline-2 focus-visible:outline-primary"
        />
      </label>

      {error && <p className="text-sm text-danger">{error}</p>}

      <Button size="lg" className="w-full max-w-xs" onClick={submit} loading={submitting}>
        Start shift
      </Button>
    </div>
  );
}
