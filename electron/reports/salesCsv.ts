import type { Sale } from "../../shared/types/domain";

const HEADERS = [
  "Sale ID",
  "Date",
  "Staff",
  "Status",
  "Payment Method",
  "Items",
  "Item Count",
  "Subtotal",
  "Discount",
  "Total",
  "Sync Status",
  "Match Status",
  "Transaction Ref",
  "Order Number",
  "Void Reason",
];

/** DD/MM/YYYY HH:MM:SS, matching electron/hardware/receipt.ts's own date formatting for consistency across the app. */
function formatDateTime(ms: number): string {
  const d = new Date(ms);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${pad(d.getDate())}/${pad(d.getMonth() + 1)}/${d.getFullYear()} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
}

/** Quotes a field only if it needs it (contains a comma, quote, or newline) — doubling any internal quotes, per the standard CSV escaping rule. */
function csvField(value: string | number): string {
  const str = String(value);
  return /[",\n]/.test(str) ? `"${str.replace(/"/g, '""')}"` : str;
}

/**
 * One row per sale — no thermal-printer-style hand-rolled encoding needed
 * here, just plain CSV text, but the "no dependency" approach carries over
 * from electron/hardware/receipt.ts (CSV is simple enough not to need a
 * library). `staffNames` resolves `sale.staffId` to a display name since
 * `Sale` itself only carries the id.
 */
export function buildSalesCsv(sales: Sale[], staffNames: Record<string, string>): string {
  const rows = sales.map((sale) => {
    const itemsSummary = sale.items.map((item) => `${item.quantity} x ${item.nameAtSale}`).join("; ");
    return [
      sale.id,
      sale.soldAt ? formatDateTime(sale.soldAt) : "",
      staffNames[sale.staffId] ?? sale.staffId,
      sale.status,
      sale.paymentMethodLabel ?? "",
      itemsSummary,
      sale.items.length,
      sale.subtotal.toFixed(2),
      sale.discountValue.toFixed(2),
      sale.total.toFixed(2),
      sale.syncStatus,
      sale.matchStatus,
      sale.transactionRef ?? "",
      sale.orderNumber ?? "",
      sale.voidReason ?? "",
    ]
      .map(csvField)
      .join(",");
  });

  // CRLF line endings — the standard CSV convention, and what Excel expects.
  return [HEADERS.map(csvField).join(","), ...rows].join("\r\n");
}
