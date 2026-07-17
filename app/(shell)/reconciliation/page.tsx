"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { exportSalesToCsv } from "@/lib/exportSales";
import { formatDateTime, formatNaira } from "@/lib/format";
import { getApi } from "@/lib/ipc/client";
import { useSession } from "@/lib/session";
import { canExportData, canReconcilePayments } from "@/shared/permissions";
import type { PaymentReceiptCandidate, ReconcileSummary, Sale } from "@/shared/types/domain";

export default function ReconciliationPage() {
  const router = useRouter();
  const { session } = useSession();
  const [sales, setSales] = useState<Sale[]>([]);
  const [staffNames, setStaffNames] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);
  const [summary, setSummary] = useState<ReconcileSummary | null>(null);
  const [reconciling, setReconciling] = useState(false);
  const [searchingId, setSearchingId] = useState<string | null>(null);
  const [candidates, setCandidates] = useState<Record<string, PaymentReceiptCandidate[]>>({});
  const [matchingRef, setMatchingRef] = useState<string | null>(null);
  const [exporting, setExporting] = useState<"unmatched" | "all" | null>(null);
  const [exportMessage, setExportMessage] = useState<string | null>(null);

  const canExport = canExportData(session?.accessRole);

  useEffect(() => {
    if (session && !canReconcilePayments(session.accessRole)) {
      router.replace("/pos");
    }
  }, [session, router]);

  async function load() {
    const [salesList, staffList] = await Promise.all([getApi().sales.list(), getApi().staff.list()]);
    setSales(salesList.filter((s) => s.status === "completed" && s.matchStatus === "unmatched"));
    setStaffNames(Object.fromEntries(staffList.map((s) => [s.id, s.name])));
  }

  useEffect(() => {
    let cancelled = false;
    Promise.all([getApi().sales.list(), getApi().staff.list()]).then(([salesList, staffList]) => {
      if (cancelled) return;
      setSales(salesList.filter((s) => s.status === "completed" && s.matchStatus === "unmatched"));
      setStaffNames(Object.fromEntries(staffList.map((s) => [s.id, s.name])));
    });
    return () => {
      cancelled = true;
    };
  }, []);

  async function handleReconcileAll() {
    setReconciling(true);
    setError(null);
    setSummary(null);
    try {
      const result = await getApi().payments.reconcileAll();
      setSummary(result);
      await load();
    } catch (cause) {
      setError((cause as Error).message);
    } finally {
      setReconciling(false);
    }
  }

  // Exports exactly the unmatched list currently on screen.
  async function handleExportUnmatched() {
    setExporting("unmatched");
    setExportMessage(null);
    try {
      setExportMessage(await exportSalesToCsv(sales, staffNames, "reconciliation-unmatched.csv"));
    } catch (cause) {
      setExportMessage((cause as Error).message);
    } finally {
      setExporting(null);
    }
  }

  // A fresh, unfiltered fetch — every sale regardless of status/match, not
  // just the unmatched ones shown above.
  async function handleExportAllSales() {
    setExporting("all");
    setExportMessage(null);
    try {
      const [allSales, staff] = await Promise.all([getApi().sales.list(), getApi().staff.list()]);
      const names = Object.fromEntries(staff.map((s) => [s.id, s.name]));
      setExportMessage(await exportSalesToCsv(allSales, names, "sales-all.csv"));
    } catch (cause) {
      setExportMessage((cause as Error).message);
    } finally {
      setExporting(null);
    }
  }

  async function handleSearch(sale: Sale) {
    setSearchingId(sale.id);
    setError(null);
    try {
      const result = await getApi().payments.search({
        amount: sale.total,
        // status: "completed" guarantees both are set.
        time: new Date(sale.soldAt!).toISOString(),
        paymentMethodId: sale.paymentMethodId!,
      });
      setCandidates((prev) => ({ ...prev, [sale.id]: result.receipts }));
    } catch (cause) {
      setError((cause as Error).message);
    } finally {
      setSearchingId(null);
    }
  }

  async function handleClaim(sale: Sale, transactionRef: string) {
    setMatchingRef(transactionRef);
    setError(null);
    try {
      await getApi().payments.match(sale.id, transactionRef);
      setCandidates((prev) => {
        const next = { ...prev };
        delete next[sale.id];
        return next;
      });
      await load();
    } catch (cause) {
      setError((cause as Error).message);
    } finally {
      setMatchingRef(null);
    }
  }

  if (!session) {
    return null;
  }

  return (
    <div className="h-full overflow-y-auto p-8">
      <div className="flex flex-col gap-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-xl font-semibold text-ink">Reconciliation</h1>
            <p className="text-sm text-muted">
              Sales without a matched Squad receipt. Search by amount/time, or run an end-of-day pass.
            </p>
          </div>
          <button
            onClick={handleReconcileAll}
            disabled={reconciling || sales.length === 0}
            className="h-10 rounded-full bg-primary px-5 text-sm font-medium text-primary-ink transition-colors hover:bg-primary-hover disabled:opacity-50"
          >
            {reconciling ? "Reconciling…" : "Reconcile all"}
          </button>
        </div>

        {canExport && (
          <div className="flex flex-wrap items-center gap-3">
            <button
              onClick={handleExportUnmatched}
              disabled={exporting !== null || sales.length === 0}
              className="h-10 rounded-full border border-border bg-surface px-4 text-sm font-medium text-ink transition-colors hover:bg-surface-hover disabled:opacity-50"
            >
              {exporting === "unmatched" ? "Exporting…" : "Export unmatched (CSV)"}
            </button>
            <button
              onClick={handleExportAllSales}
              disabled={exporting !== null}
              className="h-10 rounded-full border border-border bg-surface px-4 text-sm font-medium text-ink transition-colors hover:bg-surface-hover disabled:opacity-50"
            >
              {exporting === "all" ? "Exporting…" : "Export all sales (CSV)"}
            </button>
            {exportMessage && <span className="text-sm text-muted">{exportMessage}</span>}
          </div>
        )}

        {summary && (
          <p className="text-sm text-muted">
            {summary.attempted} attempted · {summary.matched} matched · {summary.ambiguous} need manual review ·{" "}
            {summary.none} no receipt found
            {summary.errors > 0 ? ` · ${summary.errors} errors` : ""}
          </p>
        )}
        {error && <p className="text-sm text-danger">{error}</p>}

        <div className="flex flex-col gap-3">
          {sales.map((sale) => (
            <div key={sale.id} className="rounded-[var(--radius-panel)] border border-border p-4">
              <div className="flex items-center justify-between gap-4">
                <div className="flex flex-col gap-0.5 text-sm">
                  <span className="text-ink">{formatDateTime(sale.soldAt!)}</span>
                  <span className="text-muted">
                    {staffNames[sale.staffId] ?? "—"} · {sale.paymentMethodLabel}
                  </span>
                </div>
                <div className="flex items-center gap-3">
                  <span className="font-figures text-base font-semibold text-ink">{formatNaira(sale.total)}</span>
                  <button
                    onClick={() => handleSearch(sale)}
                    disabled={searchingId === sale.id}
                    className="h-9 rounded-full border border-border bg-surface px-4 text-sm font-medium text-ink transition-colors hover:bg-surface-hover disabled:opacity-50"
                  >
                    {searchingId === sale.id ? "Searching…" : "Search receipts"}
                  </button>
                </div>
              </div>

              {candidates[sale.id] && (
                <div className="mt-3 flex flex-col gap-2 border-t border-border pt-3">
                  {candidates[sale.id].length === 0 && (
                    <p className="text-sm text-muted">No pending receipts match this amount/time.</p>
                  )}
                  {candidates[sale.id].map((c) => (
                    <div
                      key={c.transactionRef}
                      className="flex items-center justify-between gap-4 rounded-[var(--radius-control)] bg-surface px-3 py-2 text-sm"
                    >
                      <div className="flex flex-col">
                        <span className="text-ink">{c.narration ?? "Unknown sender"}</span>
                        <span className="text-xs text-muted">
                          {formatNaira(c.amount)} · {new Date(c.paidAt).toLocaleString("en-NG")}
                          {c.gatewayRef ? ` · RRN ${c.gatewayRef}` : ""}
                        </span>
                      </div>
                      <button
                        onClick={() => handleClaim(sale, c.transactionRef)}
                        disabled={matchingRef === c.transactionRef}
                        className="h-8 shrink-0 rounded-full bg-primary px-3 text-xs font-medium text-primary-ink transition-colors hover:bg-primary-hover disabled:opacity-50"
                      >
                        {matchingRef === c.transactionRef ? "Claiming…" : "Match"}
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          ))}
          {sales.length === 0 && (
            <p className="py-12 text-center text-sm text-muted">Nothing to reconcile — every sale is matched.</p>
          )}
        </div>
      </div>
    </div>
  );
}
