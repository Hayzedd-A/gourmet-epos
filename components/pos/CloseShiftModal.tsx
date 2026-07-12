"use client";

import { useState } from "react";
import { Button } from "../ui/Button";

interface CloseShiftModalProps {
  open: boolean;
  onClose: () => void;
  onConfirm: (closingTotal: number) => Promise<void>;
}

export function CloseShiftModal({ open, onClose, onConfirm }: CloseShiftModalProps) {
  if (!open) return null;
  return <CloseShiftDialog onClose={onClose} onConfirm={onConfirm} />;
}

function CloseShiftDialog({ onClose, onConfirm }: Omit<CloseShiftModalProps, "open">) {
  const [amount, setAmount] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function confirm() {
    setSubmitting(true);
    setError(null);
    try {
      await onConfirm(Number(amount) || 0);
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
        <h2 className="text-lg font-semibold">Close shift</h2>
        <label className="flex flex-col gap-1.5 text-sm">
          <span className="text-muted">Counted cash in drawer (₦)</span>
          <input
            type="number"
            min={0}
            autoFocus
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            className="font-figures h-11 rounded-[var(--radius-control)] border border-border bg-surface px-3 text-ink focus-visible:outline focus-visible:outline-2 focus-visible:outline-primary"
          />
        </label>
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
