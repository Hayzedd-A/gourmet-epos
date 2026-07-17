"use client";

import { useState } from "react";
import { Button } from "../ui/Button";
import { formatNaira } from "@/lib/format";
import type { Sale } from "@/shared/types/domain";

interface VoidSaleModalProps {
  sale: Sale | null;
  onClose: () => void;
  onConfirm: (sale: Sale, reason: string) => Promise<void>;
}

// A dedicated modal rather than `window.prompt()` — Electron's sandboxed
// renderer (contextIsolation + sandbox: true, see electron/main.ts) doesn't
// implement window.prompt/alert/confirm, so calling it throws
// "prompt() is not supported" instead of showing anything.
export function VoidSaleModal({ sale, onClose, onConfirm }: VoidSaleModalProps) {
  if (!sale) return null;
  return <VoidSaleDialog sale={sale} onClose={onClose} onConfirm={onConfirm} />;
}

function VoidSaleDialog({ sale, onClose, onConfirm }: { sale: Sale; onClose: () => void; onConfirm: (sale: Sale, reason: string) => Promise<void> }) {
  const [reason, setReason] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function confirm() {
    const trimmed = reason.trim();
    if (!trimmed) {
      setError("Enter a reason for voiding this sale");
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      await onConfirm(sale, trimmed);
    } catch (cause) {
      setError((cause as Error).message);
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
          <h2 className="text-lg font-semibold">Void this sale?</h2>
          <p className="text-sm text-muted">
            {formatNaira(sale.total)} — this cannot be undone.
          </p>
        </div>

        <label className="flex flex-col gap-1.5 text-sm">
          <span className="text-muted">Reason</span>
          <input
            autoFocus
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder="e.g. Customer changed their mind"
            className="h-11 rounded-[var(--radius-control)] border border-border bg-surface px-3 text-ink focus-visible:outline focus-visible:outline-2 focus-visible:outline-primary"
          />
        </label>

        {error && <p className="text-sm text-danger">{error}</p>}

        <div className="flex gap-3">
          <Button type="button" variant="secondary" className="flex-1" onClick={onClose} disabled={submitting}>
            Cancel
          </Button>
          <Button type="submit" variant="danger" className="flex-1" loading={submitting}>
            Void sale
          </Button>
        </div>
      </form>
    </dialog>
  );
}
