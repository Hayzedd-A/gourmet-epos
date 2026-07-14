"use client";

import { useState } from "react";
import { Button } from "../ui/Button";

interface HoldOrderModalProps {
  open: boolean;
  initialLabel?: string | null;
  onClose: () => void;
  onConfirm: (label: string | null) => Promise<void>;
}

export function HoldOrderModal({ open, initialLabel, onClose, onConfirm }: HoldOrderModalProps) {
  if (!open) return null;
  return <HoldOrderDialog initialLabel={initialLabel} onClose={onClose} onConfirm={onConfirm} />;
}

function HoldOrderDialog({
  initialLabel,
  onClose,
  onConfirm,
}: Omit<HoldOrderModalProps, "open">) {
  const [label, setLabel] = useState(initialLabel ?? "");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function confirm() {
    setSubmitting(true);
    setError(null);
    try {
      await onConfirm(label.trim() || null);
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
      <form
        className="flex flex-col gap-5 p-6"
        onSubmit={(e) => {
          e.preventDefault();
          void confirm();
        }}
      >
        <div>
          <h2 className="text-lg font-semibold">Hold this order</h2>
          <p className="text-sm text-muted">
            Set it aside to help the next customer — resume it later from Held Orders.
          </p>
        </div>

        <label className="flex flex-col gap-1.5 text-sm">
          <span className="text-muted">Label (optional)</span>
          <input
            autoFocus
            value={label}
            onChange={(e) => setLabel(e.target.value)}
            placeholder="e.g. Table 4, Ada"
            className="h-11 rounded-[var(--radius-control)] border border-border bg-surface px-3 text-ink focus-visible:outline focus-visible:outline-2 focus-visible:outline-primary"
          />
        </label>

        {error && <p className="text-sm text-danger">{error}</p>}

        <div className="flex gap-3">
          <Button type="button" variant="secondary" className="flex-1" onClick={onClose} disabled={submitting}>
            Cancel
          </Button>
          <Button type="submit" className="flex-1" loading={submitting}>
            Hold
          </Button>
        </div>
      </form>
    </dialog>
  );
}
