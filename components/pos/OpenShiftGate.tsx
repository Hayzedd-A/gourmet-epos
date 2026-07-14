"use client";

import { useState } from "react";
import { Button } from "../ui/Button";

interface OpenShiftGateProps {
  onOpen: () => Promise<void>;
}

export function OpenShiftGate({ onOpen }: OpenShiftGateProps) {
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit() {
    setSubmitting(true);
    setError(null);
    try {
      await onOpen();
    } catch (cause) {
      setError((cause as Error).message);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="flex h-full flex-col items-center justify-center gap-6 bg-bg px-6">
      <div className="flex flex-col items-center gap-1 text-center">
        <h1 className="text-xl font-semibold text-ink">Start your shift</h1>
        <p className="text-sm text-muted">Ready to start selling</p>
      </div>

      {error && <p className="text-sm text-danger">{error}</p>}

      <Button size="lg" className="w-full max-w-xs" onClick={submit} loading={submitting}>
        Start shift
      </Button>
    </div>
  );
}
