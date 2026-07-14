"use client";

import { useState } from "react";
import { formatNaira, formatRelativeTime } from "../../lib/format";
import type { Sale } from "../../shared/types/domain";
import { Button } from "../ui/Button";

interface HeldOrdersModalProps {
  open: boolean;
  orders: Sale[];
  onClose: () => void;
  onResume: (order: Sale) => Promise<void>;
  onDiscard: (order: Sale) => Promise<void>;
}

export function HeldOrdersModal({ open, orders, onClose, onResume, onDiscard }: HeldOrdersModalProps) {
  if (!open) return null;
  return <HeldOrdersDialog orders={orders} onClose={onClose} onResume={onResume} onDiscard={onDiscard} />;
}

function HeldOrdersDialog({
  orders,
  onClose,
  onResume,
  onDiscard,
}: Omit<HeldOrdersModalProps, "open">) {
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function handleResume(order: Sale) {
    setBusyId(order.id);
    setError(null);
    try {
      await onResume(order);
    } catch (cause) {
      setError((cause as Error).message);
    } finally {
      setBusyId(null);
    }
  }

  async function handleDiscard(order: Sale) {
    if (!window.confirm(`Discard "${order.label ?? "this order"}"? This cannot be undone.`)) return;
    setBusyId(order.id);
    setError(null);
    try {
      await onDiscard(order);
    } catch (cause) {
      setError((cause as Error).message);
    } finally {
      setBusyId(null);
    }
  }

  return (
    <dialog
      ref={(node) => node?.showModal()}
      onClose={onClose}
      className="w-full max-w-lg rounded-[var(--radius-panel)] border border-border bg-bg p-0 text-ink backdrop:bg-black/40"
    >
      <div className="flex max-h-[80vh] flex-col gap-4 p-6">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold">Held orders</h2>
          <button onClick={onClose} className="text-sm text-muted hover:text-ink">
            Close
          </button>
        </div>

        {error && <p className="text-sm text-danger">{error}</p>}

        <div className="flex-1 overflow-y-auto">
          {orders.length === 0 ? (
            <p className="py-8 text-center text-sm text-muted">Nothing held right now.</p>
          ) : (
            <ul className="flex flex-col gap-2">
              {orders.map((order) => (
                <li
                  key={order.id}
                  className="flex items-center justify-between gap-3 rounded-[var(--radius-control)] border border-border bg-surface p-3"
                >
                  <div className="flex flex-col gap-0.5">
                    <span className="text-sm font-medium text-ink">
                      {order.label ?? `Order ${order.id.slice(0, 6)}`}
                    </span>
                    <span className="text-xs text-muted">
                      {order.items.length} item{order.items.length === 1 ? "" : "s"} ·{" "}
                      {formatNaira(order.total)} · opened {formatRelativeTime(order.openedAt)}
                    </span>
                  </div>
                  <div className="flex shrink-0 gap-2">
                    <Button
                      variant="secondary"
                      size="md"
                      disabled={busyId === order.id}
                      onClick={() => void handleDiscard(order)}
                    >
                      Discard
                    </Button>
                    <Button size="md" loading={busyId === order.id} onClick={() => void handleResume(order)}>
                      Resume
                    </Button>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </dialog>
  );
}
