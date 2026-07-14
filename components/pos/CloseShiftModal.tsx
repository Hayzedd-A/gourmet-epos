"use client";

import { useState } from "react";
import { Button } from "../ui/Button";

interface CloseShiftModalProps {
  open: boolean;
  onClose: () => void;
  onConfirm: () => Promise<void>;
}

export function CloseShiftModal({ open, onClose, onConfirm }: CloseShiftModalProps) {
  if (!open) return null;
  return <CloseShiftDialog onClose={onClose} onConfirm={onConfirm} />;
}

function CloseShiftDialog({ onClose, onConfirm }: Omit<CloseShiftModalProps, "open">) {
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function confirm() {
    setSubmitting(true);
    setError(null);
    try {
      await onConfirm();
    } catch (cause) {
      setError((cause as Error).message);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <dialog
      ref={(node) => node?.showModal()}
      onClose={onClose}
      className="w-full max-w-sm rounded-[var(--radius-panel)] border border-border bg-bg p-0 text-ink backdrop:bg-black/40"
    >
      <div className="flex flex-col gap-5 p-6">
        <h2 className="text-lg font-semibold">End shift</h2>
        <p className="text-sm text-muted">Are you sure you want to end your shift?</p>
        {error && <p className="text-sm text-danger">{error}</p>}
        <div className="flex gap-3">
          <Button variant="secondary" className="flex-1" onClick={onClose} disabled={submitting}>
            Cancel
          </Button>
          <Button variant="danger" className="flex-1" onClick={confirm} loading={submitting}>
            End shift
          </Button>
        </div>
      </div>
    </dialog>
  );
}
