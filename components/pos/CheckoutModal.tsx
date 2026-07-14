"use client";

import { useEffect, useState } from "react";
import { formatNaira } from "../../lib/format";
import { getApi } from "../../lib/ipc/client";
import { Button } from "../ui/Button";
import type { PaymentMethodOption } from "../../shared/types/domain";

interface CheckoutModalProps {
  open: boolean;
  subtotal: number;
  onClose: () => void;
  onConfirm: (input: { paymentMethodId: string; discountValue: number }) => Promise<void>;
}

export function CheckoutModal({ open, subtotal, onClose, onConfirm }: CheckoutModalProps) {
  // Mounted only while `open` is true, so every field below starts fresh
  // each time — no reset-on-open effect needed.
  if (!open) return null;
  return <CheckoutDialog subtotal={subtotal} onClose={onClose} onConfirm={onConfirm} />;
}

function CheckoutDialog({
  subtotal,
  onClose,
  onConfirm,
}: Omit<CheckoutModalProps, "open">) {
  const [methods, setMethods] = useState<PaymentMethodOption[]>([]);
  const [paymentMethodId, setPaymentMethodId] = useState<string | null>(null);
  const [discount, setDiscount] = useState("0");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    getApi()
      .catalog.listPaymentMethods()
      .then((methods) => {
        if (cancelled) return;
        const active = methods.filter((m) => m.isActive);
        setMethods(active);
        setPaymentMethodId(active[0]?.id ?? null);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const discountValue = Number(discount) || 0;
  const total = Math.max(0, subtotal - discountValue);
  const canConfirm = paymentMethodId !== null;

  async function confirm() {
    if (!paymentMethodId) return;
    setSubmitting(true);
    setError(null);
    try {
      await onConfirm({ paymentMethodId, discountValue });
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
      className="w-full max-w-md rounded-[var(--radius-panel)] border border-border bg-bg p-0 text-ink backdrop:bg-black/40"
    >
      <div className="flex flex-col gap-5 p-6">
        <h2 className="text-lg font-semibold">Checkout</h2>

        <div className="flex justify-between text-sm">
          <span className="text-muted">Subtotal</span>
          <span className="font-figures">{formatNaira(subtotal)}</span>
        </div>

        <label className="flex flex-col gap-1.5 text-sm">
          <span className="text-muted">Discount (₦)</span>
          <input
            type="number"
            min={0}
            value={discount}
            onChange={(e) => setDiscount(e.target.value)}
            className="font-figures h-11 rounded-[var(--radius-control)] border border-border bg-surface px-3 text-ink focus-visible:outline focus-visible:outline-2 focus-visible:outline-primary"
          />
        </label>

        <div className="flex justify-between text-base font-semibold">
          <span>Total due</span>
          <span className="font-figures">{formatNaira(total)}</span>
        </div>

        <div className="flex flex-col gap-1.5 text-sm">
          <span className="text-muted">Payment method</span>
          <div className="grid grid-cols-2 gap-2">
            {methods.map((m) => (
              <button
                key={m.id}
                onClick={() => setPaymentMethodId(m.id)}
                className={`h-11 rounded-[var(--radius-control)] border text-sm font-medium transition-colors ${
                  paymentMethodId === m.id
                    ? "border-primary bg-primary text-primary-ink"
                    : "border-border bg-surface text-ink hover:bg-surface-hover"
                }`}
              >
                {m.name}
              </button>
            ))}
            {methods.length === 0 && <p className="col-span-full text-sm text-muted">Loading payment methods…</p>}
          </div>
        </div>

        {error && <p className="text-sm text-danger">{error}</p>}

        <div className="flex gap-3">
          <Button variant="secondary" className="flex-1" onClick={onClose} disabled={submitting}>
            Cancel
          </Button>
          <Button className="flex-1" onClick={confirm} loading={submitting} disabled={!canConfirm}>
            Confirm
          </Button>
        </div>
      </div>
    </dialog>
  );
}
