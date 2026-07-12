"use client";

import { formatNaira } from "../../lib/format";
import type { CartLine } from "../../lib/useCart";
import { Button } from "../ui/Button";

interface CartProps {
  lines: CartLine[];
  subtotal: number;
  onSetQuantity: (productId: string, quantity: number) => void;
  onRemove: (productId: string) => void;
  onCharge: () => void;
}

export function Cart({ lines, subtotal, onSetQuantity, onRemove, onCharge }: CartProps) {
  return (
    <div className="flex h-full flex-col rounded-[var(--radius-panel)] border border-border bg-surface">
      <div className="border-b border-border px-4 py-3">
        <h2 className="text-sm font-semibold text-ink">Current sale</h2>
      </div>

      <div className="flex-1 overflow-y-auto px-4 py-2">
        {lines.length === 0 ? (
          <p className="py-8 text-center text-sm text-muted">Tap a product to add it</p>
        ) : (
          <ul className="divide-y divide-border">
            {lines.map((line) => (
              <li key={line.productId} className="flex items-center gap-2 py-3">
                <div className="flex-1 min-w-0">
                  <p className="truncate text-sm font-medium text-ink">{line.name}</p>
                  <p className="font-figures text-xs text-muted">{formatNaira(line.unitPrice)} each</p>
                </div>
                <div className="flex items-center gap-1.5">
                  <button
                    onClick={() => onSetQuantity(line.productId, line.quantity - 1)}
                    className="flex h-8 w-8 items-center justify-center rounded-full border border-border text-ink hover:bg-surface-hover"
                    aria-label={`Decrease ${line.name} quantity`}
                  >
                    −
                  </button>
                  <span className="font-figures w-6 text-center text-sm text-ink">{line.quantity}</span>
                  <button
                    onClick={() => onSetQuantity(line.productId, line.quantity + 1)}
                    className="flex h-8 w-8 items-center justify-center rounded-full border border-border text-ink hover:bg-surface-hover"
                    aria-label={`Increase ${line.name} quantity`}
                  >
                    +
                  </button>
                </div>
                <p className="font-figures w-20 shrink-0 text-right text-sm font-medium text-ink">
                  {formatNaira(line.unitPrice * line.quantity)}
                </p>
                <button
                  onClick={() => onRemove(line.productId)}
                  className="ml-1 text-muted hover:text-danger"
                  aria-label={`Remove ${line.name}`}
                >
                  ✕
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>

      <div className="border-t border-border p-4">
        <div className="mb-3 flex items-center justify-between">
          <span className="text-sm text-muted">Subtotal</span>
          <span className="font-figures text-lg font-semibold text-ink">{formatNaira(subtotal)}</span>
        </div>
        <Button size="lg" className="w-full" disabled={lines.length === 0} onClick={onCharge}>
          Charge {lines.length > 0 ? formatNaira(subtotal) : ""}
        </Button>
      </div>
    </div>
  );
}
