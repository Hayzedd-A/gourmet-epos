"use client";

import { useRef, useState } from "react";
import { formatNaira } from "../../lib/format";
import { Button } from "../ui/Button";
import type { PaymentMethod } from "../../shared/types/domain";

interface CheckoutModalProps {
  open: boolean;
  subtotal: number;
  onClose: () => void;
  onConfirm: (input: { paymentMethod: PaymentMethod; discountValue: number; amountTendered: number | null }) => Promise<void>;
}

const PAYMENT_METHODS: { value: PaymentMethod; label: string }[] = [
  { value: "cash", label: "Cash" },
  { value: "card", label: "Card" },
  { value: "transfer", label: "Transfer" },
];

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
  const dialogRef = useRef<HTMLDialogElement | null>(null);
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>("cash");
  const [discount, setDiscount] = useState("0");
  const [tendered, setTendered] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const discountValue = Number(discount) || 0;
  const total = Math.max(0, subtotal - discountValue);
  const tenderedValue = Number(tendered) || 0;
  const change = paymentMethod === "cash" ? Math.max(0, tenderedValue - total) : 0;

  async function confirm() {
    setSubmitting(true);
    setError(null);
    try {
      await onConfirm({
        paymentMethod,
        discountValue,
        amountTendered: paymentMethod === "cash" ? tenderedValue : total,
      });
    } catch (cause) {
      setError((cause as Error).message);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <dialog
      ref={(node) => {
        dialogRef.current = node;
        node?.showModal();
      }}
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

        <div className="grid grid-cols-3 gap-2">
          {PAYMENT_METHODS.map((m) => (
            <button
              key={m.value}
              onClick={() => setPaymentMethod(m.value)}
              className={`h-11 rounded-[var(--radius-control)] border text-sm font-medium transition-colors ${
                paymentMethod === m.value
                  ? "border-primary bg-primary text-primary-ink"
                  : "border-border bg-surface text-ink hover:bg-surface-hover"
              }`}
            >
              {m.label}
            </button>
          ))}
        </div>

        {paymentMethod === "cash" && (
          <label className="flex flex-col gap-1.5 text-sm">
            <span className="text-muted">Amount tendered (₦)</span>
            <input
              type="number"
              min={0}
              value={tendered}
              onChange={(e) => setTendered(e.target.value)}
              className="font-figures h-11 rounded-[var(--radius-control)] border border-border bg-surface px-3 text-ink focus-visible:outline focus-visible:outline-2 focus-visible:outline-primary"
              autoFocus
            />
            <span className="font-figures text-sm text-muted">Change: {formatNaira(change)}</span>
          </label>
        )}

        {error && <p className="text-sm text-danger">{error}</p>}

        <div className="flex gap-3">
          <Button variant="secondary" className="flex-1" onClick={onClose} disabled={submitting}>
            Cancel
          </Button>
          <Button
            className="flex-1"
            onClick={confirm}
            loading={submitting}
            disabled={paymentMethod === "cash" && tenderedValue < total}
          >
            Confirm
          </Button>
        </div>
      </div>
    </dialog>
  );
}
