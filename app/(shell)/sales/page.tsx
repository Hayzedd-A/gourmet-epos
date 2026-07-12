"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { formatDateTime, formatNaira } from "@/lib/format";
import { getApi } from "@/lib/ipc/client";
import { useSession } from "@/lib/session";
import { canManageCatalog } from "@/shared/permissions";
import type { Sale } from "@/shared/types/domain";

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

export default function SalesPage() {
  const router = useRouter();
  const { session } = useSession();
  const [sales, setSales] = useState<Sale[]>([]);
  const [staffNames, setStaffNames] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (session && !canManageCatalog(session.accessRole)) {
      router.replace("/pos");
    }
  }, [session, router]);

  async function load() {
    const [salesList, staffList] = await Promise.all([getApi().sales.list(), getApi().staff.list()]);
    setSales(salesList);
    setStaffNames(Object.fromEntries(staffList.map((s) => [s.id, s.name])));
  }

  useEffect(() => {
    let cancelled = false;
    Promise.all([getApi().sales.list(), getApi().staff.list()]).then(([salesList, staffList]) => {
      if (cancelled) return;
      setSales(salesList);
      setStaffNames(Object.fromEntries(staffList.map((s) => [s.id, s.name])));
    });
    return () => {
      cancelled = true;
    };
  }, []);

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

  if (!session || !canManageCatalog(session.accessRole)) {
    return null;
  }

  return (
    <div className="h-full overflow-y-auto p-8">
      <div className="flex flex-col gap-6">
        <div>
          <h1 className="text-xl font-semibold text-ink">Sales</h1>
          <p className="text-sm text-muted">All sales recorded on this terminal, newest first.</p>
        </div>

        {error && <p className="text-sm text-danger">{error}</p>}

        <div className="overflow-hidden rounded-[var(--radius-panel)] border border-border">
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
                <th className="px-4 py-3" />
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {sales.map((sale) => (
                <tr key={sale.id} className={sale.status === "voided" ? "opacity-50" : undefined}>
                  <td className="px-4 py-3 text-ink">{formatDateTime(sale.soldAt)}</td>
                  <td className="px-4 py-3 text-muted">{staffNames[sale.staffId] ?? "—"}</td>
                  <td className="px-4 py-3 text-muted">{sale.items.length}</td>
                  <td className="px-4 py-3 capitalize text-muted">{sale.paymentMethod}</td>
                  <td className="font-figures px-4 py-3 text-ink">{formatNaira(sale.total)}</td>
                  <td className="px-4 py-3 capitalize text-muted">{sale.status}</td>
                  <td className="px-4 py-3">
                    <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${SYNC_CLASS[sale.syncStatus]}`}>
                      {SYNC_LABEL[sale.syncStatus]}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-right">
                    {sale.status === "completed" && (
                      <button
                        onClick={() => handleVoid(sale)}
                        className="text-sm font-medium text-danger hover:underline"
                      >
                        Void
                      </button>
                    )}
                  </td>
                </tr>
              ))}
              {sales.length === 0 && (
                <tr>
                  <td colSpan={8} className="px-4 py-10 text-center text-muted">
                    No sales yet.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
