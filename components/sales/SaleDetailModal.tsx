"use client";

import { formatDateTime, formatNaira } from "../../lib/format";
import type { Sale } from "../../shared/types/domain";

interface SaleDetailModalProps {
  sale: Sale | null;
  staffName: string;
  onClose: () => void;
}

export function SaleDetailModal({ sale, staffName, onClose }: SaleDetailModalProps) {
  if (!sale) return null;
  return <SaleDetailDialog sale={sale} staffName={staffName} onClose={onClose} />;
}

function SaleDetailDialog({
  sale,
  staffName,
  onClose,
}: Omit<SaleDetailModalProps, "sale"> & { sale: Sale }) {
  return (
    <dialog
      ref={(node) => node?.showModal()}
      onClose={onClose}
      className="w-full max-w-lg rounded-[var(--radius-panel)] border border-border bg-bg p-0 text-ink backdrop:bg-black/40"
    >
      <div className="flex max-h-[80vh] flex-col gap-5 p-6">
        <div className="flex items-start justify-between">
          <div>
            <h2 className="text-lg font-semibold">Sale details</h2>
            <p className="text-sm text-muted">
              {sale.soldAt ? formatDateTime(sale.soldAt) : "—"} · {staffName}
            </p>
          </div>
          <button onClick={onClose} className="text-sm text-muted hover:text-ink">
            Close
          </button>
        </div>

        <div className="flex items-center gap-2">
          <span
            className={`rounded-full px-2 py-0.5 text-xs font-medium capitalize ${
              sale.status === "voided" ? "bg-danger/15 text-danger" : "bg-success/15 text-success"
            }`}
          >
            {sale.status}
          </span>
          {sale.status === "voided" && sale.voidReason && (
            <span className="text-xs text-muted">Reason: {sale.voidReason}</span>
          )}
        </div>

        <div className="flex-1 overflow-y-auto">
          <table className="w-full text-sm">
            <thead className="text-left text-xs uppercase tracking-wide text-muted">
              <tr>
                <th className="pb-2 font-medium">Item</th>
                <th className="pb-2 text-right font-medium">Qty</th>
                <th className="pb-2 text-right font-medium">Unit</th>
                <th className="pb-2 text-right font-medium">Total</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {sale.items.map((item) => (
                <tr key={item.id}>
                  <td className="py-2 text-ink">{item.nameAtSale}</td>
                  <td className="font-figures py-2 text-right text-muted">{item.quantity}</td>
                  <td className="font-figures py-2 text-right text-muted">{formatNaira(item.unitPriceAtSale)}</td>
                  <td className="font-figures py-2 text-right text-ink">{formatNaira(item.lineTotal)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="flex flex-col gap-1 border-t border-border pt-3 text-sm">
          <div className="flex justify-between text-muted">
            <span>Subtotal</span>
            <span className="font-figures">{formatNaira(sale.subtotal)}</span>
          </div>
          {sale.discountValue > 0 && (
            <div className="flex justify-between text-muted">
              <span>Discount</span>
              <span className="font-figures">-{formatNaira(sale.discountValue)}</span>
            </div>
          )}
          <div className="flex justify-between text-base font-semibold text-ink">
            <span>Total</span>
            <span className="font-figures">{formatNaira(sale.total)}</span>
          </div>
        </div>

        <div className="flex flex-col gap-1.5 rounded-[var(--radius-control)] bg-surface p-3 text-sm">
          <div className="flex justify-between">
            <span className="text-muted">Payment method</span>
            <span className="text-ink">{sale.paymentMethodLabel ?? "—"}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-muted">Reconciliation</span>
            {sale.matchStatus === "matched" ? (
              <span className="rounded-full bg-success/15 px-2 py-0.5 text-xs font-medium text-success">
                Matched
              </span>
            ) : (
              <span className="rounded-full bg-warning/15 px-2 py-0.5 text-xs font-medium text-warning-ink">
                Unmatched
              </span>
            )}
          </div>
          {sale.matchStatus === "matched" && (
            <>
              {sale.transactionRef && (
                <div className="flex justify-between">
                  <span className="text-muted">Transaction ref</span>
                  <span className="font-figures text-ink">{sale.transactionRef}</span>
                </div>
              )}
              {sale.matchedAt && (
                <div className="flex justify-between">
                  <span className="text-muted">Matched at</span>
                  <span className="text-ink">{formatDateTime(sale.matchedAt)}</span>
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </dialog>
  );
}
