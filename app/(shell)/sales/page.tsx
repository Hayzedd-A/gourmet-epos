"use client";

import { useEffect, useMemo, useState } from "react";
import { SaleDetailModal } from "@/components/sales/SaleDetailModal";
import { formatDateTime, formatNaira } from "@/lib/format";
import { getApi } from "@/lib/ipc/client";
import { useSession } from "@/lib/session";
import { canManageCatalog, canViewAllSales } from "@/shared/permissions";
import type { Sale, StaffMember } from "@/shared/types/domain";

const SYNC_LABEL: Record<Sale["syncStatus"], string> = {
  synced: "Synced",
  pending: "Pending sync",
  failed: "Sync failed",
};

const SYNC_CLASS: Record<Sale["syncStatus"], string> = {
  synced: "bg-success/15 text-success",
  pending: "bg-warning/15 text-warning-ink",
  failed: "bg-danger/15 text-danger",
};

type ViewMode = "all" | "byShift";

function startOfDayMs(dateStr: string): number | undefined {
  return dateStr ? new Date(`${dateStr}T00:00:00`).getTime() : undefined;
}

function endOfDayMs(dateStr: string): number | undefined {
  return dateStr ? new Date(`${dateStr}T23:59:59.999`).getTime() : undefined;
}

export default function SalesPage() {
  const { session } = useSession();
  const [sales, setSales] = useState<Sale[]>([]);
  const [staffList, setStaffList] = useState<StaffMember[]>([]);
  const [staffNames, setStaffNames] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);
  const [selectedSale, setSelectedSale] = useState<Sale | null>(null);
  const [reprintingId, setReprintingId] = useState<string | null>(null);

  const [viewMode, setViewMode] = useState<ViewMode>("all");
  const [fromDate, setFromDate] = useState("");
  const [toDate, setToDate] = useState("");
  const [staffFilter, setStaffFilter] = useState("");

  const canVoid = canManageCatalog(session?.accessRole);
  const canFilterByStaff = canViewAllSales(session?.accessRole);

  async function load() {
    const [salesList, staff] = await Promise.all([
      getApi().sales.list({
        from: startOfDayMs(fromDate),
        to: endOfDayMs(toDate),
        staffId: canFilterByStaff && staffFilter ? staffFilter : undefined,
      }),
      getApi().staff.list(),
    ]);
    setSales(salesList);
    setStaffList(staff);
    setStaffNames(Object.fromEntries(staff.map((s) => [s.id, s.name])));
  }

  useEffect(() => {
    let cancelled = false;
    getApi()
      .sales.list({
        from: startOfDayMs(fromDate),
        to: endOfDayMs(toDate),
        staffId: canFilterByStaff && staffFilter ? staffFilter : undefined,
      })
      .then((salesList) => {
        if (!cancelled) setSales(salesList);
      });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fromDate, toDate, staffFilter]);

  useEffect(() => {
    let cancelled = false;
    getApi()
      .staff.list()
      .then((staff) => {
        if (cancelled) return;
        setStaffList(staff);
        setStaffNames(Object.fromEntries(staff.map((s) => [s.id, s.name])));
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const shiftGroups = useMemo(() => {
    const map = new Map<string, Sale[]>();
    for (const s of sales) {
      const group = map.get(s.shiftId);
      if (group) group.push(s);
      else map.set(s.shiftId, [s]);
    }
    return [...map.entries()]
      .map(([shiftId, shiftSales]) => {
        const sorted = [...shiftSales].sort((a, b) => (b.soldAt ?? 0) - (a.soldAt ?? 0));
        const times = shiftSales.map((s) => s.soldAt ?? 0).filter((t) => t > 0);
        return {
          shiftId,
          sales: sorted,
          staffId: shiftSales[0].staffId,
          total: shiftSales.filter((s) => s.status === "completed").reduce((sum, s) => sum + s.total, 0),
          latest: times.length ? Math.max(...times) : 0,
          earliest: times.length ? Math.min(...times) : 0,
        };
      })
      .sort((a, b) => b.latest - a.latest);
  }, [sales]);

  async function handleVoid(sale: Sale) {
    const reason = window.prompt(`Reason for voiding this ${formatNaira(sale.total)} sale?`);
    if (!reason) return;
    setError(null);
    try {
      await getApi().sales.void(sale.id, reason);
      await load();
    } catch (cause) {
      setError((cause as Error).message);
    }
  }

  async function handleReprint(sale: Sale) {
    setReprintingId(sale.id);
    setError(null);
    try {
      await getApi().printer.printReceipt(sale.id);
    } catch (cause) {
      setError((cause as Error).message);
    } finally {
      setReprintingId(null);
    }
  }

  if (!session) {
    return null;
  }

  function renderSalesTable(rows: Sale[]) {
    return (
      <div className="overflow-hidden rounded-[var(--radius-panel)] border border-border">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-surface text-left text-xs uppercase tracking-wide text-muted">
              <tr>
                <th className="px-4 py-3 font-medium">Time</th>
                <th className="px-4 py-3 font-medium">Staff</th>
                <th className="px-4 py-3 font-medium">Items</th>
                <th className="px-4 py-3 font-medium">Payment</th>
                <th className="px-4 py-3 font-medium">Total</th>
                <th className="px-4 py-3 font-medium">Status</th>
                <th className="px-4 py-3 font-medium">Sync</th>
                <th className="px-4 py-3 font-medium">Reconciled</th>
                <th className="px-4 py-3" />
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {rows.map((sale) => (
                <tr
                  key={sale.id}
                  onClick={() => setSelectedSale(sale)}
                  className={`cursor-pointer hover:bg-surface ${sale.status === "voided" ? "opacity-50" : ""}`}
                >
                  <td className="px-4 py-3 text-ink">{formatDateTime(sale.soldAt!)}</td>
                  <td className="px-4 py-3 text-muted">{staffNames[sale.staffId] ?? "—"}</td>
                  <td className="px-4 py-3 text-muted">{sale.items.length}</td>
                  <td className="px-4 py-3 text-muted">{sale.paymentMethodLabel}</td>
                  <td className="font-figures px-4 py-3 text-ink">{formatNaira(sale.total)}</td>
                  <td className="px-4 py-3 capitalize text-muted">{sale.status}</td>
                  <td className="px-4 py-3">
                    <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${SYNC_CLASS[sale.syncStatus]}`}>
                      {SYNC_LABEL[sale.syncStatus]}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <span
                      className={`rounded-full px-2 py-0.5 text-xs font-medium ${
                        sale.matchStatus === "matched" ? "bg-success/15 text-success" : "bg-warning/15 text-warning-ink"
                      }`}
                    >
                      {sale.matchStatus === "matched" ? "Matched" : "Unmatched"}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-right">
                    <div className="flex justify-end gap-3">
                      {sale.status === "completed" && (
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            void handleReprint(sale);
                          }}
                          disabled={reprintingId === sale.id}
                          className="text-sm font-medium text-ink hover:underline disabled:opacity-50"
                        >
                          {reprintingId === sale.id ? "Printing…" : "Reprint"}
                        </button>
                      )}
                      {canVoid && sale.status === "completed" && (
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            void handleVoid(sale);
                          }}
                          className="text-sm font-medium text-danger hover:underline"
                        >
                          Void
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
              {rows.length === 0 && (
                <tr>
                  <td colSpan={9} className="px-4 py-10 text-center text-muted">
                    No sales yet.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    );
  }

  return (
    <div className="h-full overflow-y-auto p-8">
      <div className="flex flex-col gap-6">
        <div className="flex items-center justify-between gap-4">
          <div>
            <h1 className="text-xl font-semibold text-ink">Sales</h1>
            <p className="text-sm text-muted">
              {canFilterByStaff ? "All sales recorded on this terminal." : "Your sales recorded on this terminal."}
            </p>
          </div>
          <div className="flex shrink-0 gap-1 rounded-full border border-border bg-surface p-1 text-sm">
            <button
              onClick={() => setViewMode("all")}
              className={`rounded-full px-4 py-1.5 font-medium transition-colors ${
                viewMode === "all" ? "bg-primary text-primary-ink" : "text-muted hover:text-ink"
              }`}
            >
              All sales
            </button>
            <button
              onClick={() => setViewMode("byShift")}
              className={`rounded-full px-4 py-1.5 font-medium transition-colors ${
                viewMode === "byShift" ? "bg-primary text-primary-ink" : "text-muted hover:text-ink"
              }`}
            >
              Group by shift
            </button>
          </div>
        </div>

        <div className="flex flex-wrap items-end gap-3">
          <label className="flex flex-col gap-1 text-sm">
            <span className="text-muted">From</span>
            <input
              type="date"
              value={fromDate}
              onChange={(e) => setFromDate(e.target.value)}
              className="h-10 rounded-[var(--radius-control)] border border-border bg-surface px-3 text-ink focus-visible:outline focus-visible:outline-2 focus-visible:outline-primary"
            />
          </label>
          <label className="flex flex-col gap-1 text-sm">
            <span className="text-muted">To</span>
            <input
              type="date"
              value={toDate}
              onChange={(e) => setToDate(e.target.value)}
              className="h-10 rounded-[var(--radius-control)] border border-border bg-surface px-3 text-ink focus-visible:outline focus-visible:outline-2 focus-visible:outline-primary"
            />
          </label>
          {canFilterByStaff && (
            <label className="flex flex-col gap-1 text-sm">
              <span className="text-muted">Staff</span>
              <select
                value={staffFilter}
                onChange={(e) => setStaffFilter(e.target.value)}
                className="h-10 rounded-[var(--radius-control)] border border-border bg-surface px-3 text-ink focus-visible:outline focus-visible:outline-2 focus-visible:outline-primary"
              >
                <option value="">All staff</option>
                {staffList.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
              </select>
            </label>
          )}
          {(fromDate || toDate || staffFilter) && (
            <button
              onClick={() => {
                setFromDate("");
                setToDate("");
                setStaffFilter("");
              }}
              className="h-10 rounded-full px-3 text-sm font-medium text-muted hover:text-ink"
            >
              Clear filters
            </button>
          )}
        </div>

        {error && <p className="text-sm text-danger">{error}</p>}

        {viewMode === "all" ? (
          renderSalesTable(sales)
        ) : (
          <div className="flex flex-col gap-6">
            {shiftGroups.length === 0 && (
              <p className="py-10 text-center text-sm text-muted">No sales yet.</p>
            )}
            {shiftGroups.map((group) => (
              <div key={group.shiftId} className="flex flex-col gap-2">
                <div className="flex items-center justify-between rounded-[var(--radius-control)] bg-surface px-4 py-2 text-sm">
                  <span className="font-medium text-ink">
                    {staffNames[group.staffId] ?? "—"}
                    <span className="ml-2 font-normal text-muted">
                      {group.earliest ? formatDateTime(group.earliest) : "—"}
                      {group.latest && group.latest !== group.earliest ? ` – ${formatDateTime(group.latest)}` : ""}
                    </span>
                  </span>
                  <span className="text-muted">
                    {group.sales.length} sale{group.sales.length === 1 ? "" : "s"} ·{" "}
                    <span className="font-figures font-medium text-ink">{formatNaira(group.total)}</span>
                  </span>
                </div>
                {renderSalesTable(group.sales)}
              </div>
            ))}
          </div>
        )}
      </div>

      <SaleDetailModal
        sale={selectedSale}
        staffName={selectedSale ? staffNames[selectedSale.staffId] ?? "—" : ""}
        onClose={() => setSelectedSale(null)}
        onReprint={handleReprint}
      />
    </div>
  );
}
