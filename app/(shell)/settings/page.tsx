"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/Button";
import { ReceiptPreview } from "@/components/settings/ReceiptPreview";
import { formatDateTime } from "@/lib/format";
import { getApi } from "@/lib/ipc/client";
import { useSyncState } from "@/lib/useSyncState";
import type { DiscoveredPrinter, PrinterStatus } from "@/shared/types/domain";

export default function SettingsPage() {
  const syncState = useSyncState();
  const [syncing, setSyncing] = useState(false);

  const [printerStatus, setPrinterStatus] = useState<PrinterStatus | null>(null);
  const [printers, setPrinters] = useState<DiscoveredPrinter[]>([]);
  const [loadingPrinters, setLoadingPrinters] = useState(false);
  const [selectedPrinter, setSelectedPrinter] = useState("");
  const [savingPrinter, setSavingPrinter] = useState(false);
  const [displayName, setDisplayName] = useState("");
  const [savingName, setSavingName] = useState(false);
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<string | null>(null);

  const [storeAddress, setStoreAddress] = useState("");
  const [storePhone, setStorePhone] = useState("");
  const [storeEmail, setStoreEmail] = useState("");
  const [savingStoreInfo, setSavingStoreInfo] = useState(false);

  async function loadPrinters() {
    setLoadingPrinters(true);
    try {
      setPrinters(await getApi().printer.listPrinters());
    } finally {
      setLoadingPrinters(false);
    }
  }

  useEffect(() => {
    let cancelled = false;
    Promise.all([getApi().printer.getStatus(), getApi().terminal.getStatus(), getApi().printer.listPrinters()]).then(
      ([printer, terminal, printerList]) => {
        if (cancelled) return;
        setPrinterStatus(printer);
        setDisplayName(terminal.displayName ?? "");
        setStoreAddress(terminal.storeAddress ?? "");
        setStorePhone(terminal.storePhone ?? "");
        setStoreEmail(terminal.storeEmail ?? "");
        setPrinters(printerList);
        setSelectedPrinter(printer.target ?? "");
      },
    );
    return () => {
      cancelled = true;
    };
  }, []);

  async function syncNow() {
    setSyncing(true);
    try {
      await getApi().sync.triggerNow();
    } finally {
      setSyncing(false);
    }
  }

  async function saveDisplayName() {
    setSavingName(true);
    try {
      await getApi().terminal.updateDisplayName(displayName.trim() || null);
    } finally {
      setSavingName(false);
    }
  }

  async function saveStoreInfo() {
    setSavingStoreInfo(true);
    try {
      await getApi().terminal.updateStoreInfo({
        address: storeAddress.trim() || null,
        phone: storePhone.trim() || null,
        email: storeEmail.trim() || null,
      });
    } finally {
      setSavingStoreInfo(false);
    }
  }

  async function savePrinter() {
    setSavingPrinter(true);
    try {
      const status = await getApi().printer.setPrinterName(selectedPrinter || null);
      setPrinterStatus(status);
    } finally {
      setSavingPrinter(false);
    }
  }

  async function testPrint() {
    setTesting(true);
    setTestResult(null);
    try {
      const result = await getApi().printer.testPrint();
      setTestResult(result.printed ? "Test slip sent to the printer." : `Not printed: ${result.reason ?? "unknown error"}`);
    } catch (cause) {
      setTestResult((cause as Error).message);
    } finally {
      setTesting(false);
    }
  }

  return (
    <div className="h-full overflow-y-auto p-8">
      <div className="flex max-w-lg flex-col gap-8">
        <div>
          <h1 className="text-xl font-semibold text-ink">Settings</h1>
          <p className="text-sm text-muted">
            Sales and catalog updates sync in the background automatically. Anyone can trigger a sync manually
            from here.
          </p>
        </div>

        <div className="flex flex-col gap-4 rounded-[var(--radius-panel)] border border-border bg-surface p-5">
          <div className="flex items-center justify-between">
            <span className="text-sm font-medium text-ink">Terminal activation</span>
            <span
              className={`rounded-full px-2 py-0.5 text-xs font-medium ${
                syncState?.activated ? "bg-success/15 text-success" : "bg-muted/15 text-muted"
              }`}
            >
              {syncState?.activated ? "Activated" : "Not activated"}
            </span>
          </div>

          {syncState && (
            <dl className="grid grid-cols-2 gap-y-1 text-xs text-muted">
              <dt>Last catalog sync</dt>
              <dd className="text-right text-ink">
                {syncState.lastSyncedAt.catalog ? formatDateTime(syncState.lastSyncedAt.catalog) : "Never"}
              </dd>
              <dt>Pending sales</dt>
              <dd className="text-right text-ink">{syncState.pendingOutboxCount}</dd>
              {syncState.lastError && (
                <>
                  <dt>Last error</dt>
                  <dd className="text-right text-danger">{syncState.lastError}</dd>
                </>
              )}
            </dl>
          )}

          <Button onClick={syncNow} loading={syncing} className="self-start">
            Sync now
          </Button>
        </div>

        <div className="flex items-center justify-between rounded-[var(--radius-panel)] border border-border bg-surface p-5">
          <span className="text-sm font-medium text-ink">Super admin connection</span>
          <span
            className={`rounded-full px-2 py-0.5 text-xs font-medium ${
              syncState?.authenticated ? "bg-success/15 text-success" : "bg-muted/15 text-muted"
            }`}
          >
            {syncState?.authenticated ? "Connected" : "Not connected"}
          </span>
        </div>

        <div className="flex flex-col gap-4 rounded-[var(--radius-panel)] border border-border bg-surface p-5">
          <span className="text-sm font-medium text-ink">Store info</span>
          <p className="text-xs text-muted">
            Printed on the receipt just under the store name, above the itemized list.
          </p>

          <label className="flex flex-col gap-1.5 text-sm">
            <span className="text-muted">Address</span>
            <textarea
              value={storeAddress}
              onChange={(e) => setStoreAddress(e.target.value)}
              placeholder={"e.g. 19B Fola Osibo, Lekki 1\nLagos"}
              rows={2}
              className="resize-y rounded-[var(--radius-control)] border border-border bg-bg px-3 py-2 text-ink focus-visible:outline focus-visible:outline-2 focus-visible:outline-primary"
            />
          </label>

          <label className="flex flex-col gap-1.5 text-sm">
            <span className="text-muted">Phone number</span>
            <input
              value={storePhone}
              onChange={(e) => setStorePhone(e.target.value)}
              placeholder="e.g. 0701 824 9203"
              className="h-10 rounded-[var(--radius-control)] border border-border bg-bg px-3 text-ink focus-visible:outline focus-visible:outline-2 focus-visible:outline-primary"
            />
          </label>

          <label className="flex flex-col gap-1.5 text-sm">
            <span className="text-muted">Email</span>
            <input
              value={storeEmail}
              onChange={(e) => setStoreEmail(e.target.value)}
              placeholder="e.g. hello@gourmettwist.ng"
              className="h-10 rounded-[var(--radius-control)] border border-border bg-bg px-3 text-ink focus-visible:outline focus-visible:outline-2 focus-visible:outline-primary"
            />
          </label>

          <Button onClick={saveStoreInfo} loading={savingStoreInfo} className="self-start">
            Save store info
          </Button>
        </div>

        <div className="flex flex-col gap-3 rounded-[var(--radius-panel)] border border-border bg-surface p-5">
          <span className="text-sm font-medium text-ink">Receipt preview</span>
          <p className="text-xs text-muted">
            An approximation of the printed receipt — updates as you type above. The barcode is drawn by this
            preview independently of the printer, so treat its exact bar widths as illustrative, not a byte-for-byte
            copy of the print job.
          </p>
          <ReceiptPreview storeAddress={storeAddress} storePhone={storePhone} storeEmail={storeEmail} />
        </div>

        <div className="flex flex-col gap-4 rounded-[var(--radius-panel)] border border-border bg-surface p-5">
          <div className="flex items-center justify-between">
            <span className="text-sm font-medium text-ink">Receipt printer</span>
            <span
              className={`rounded-full px-2 py-0.5 text-xs font-medium ${
                printerStatus?.configured ? "bg-success/15 text-success" : "bg-muted/15 text-muted"
              }`}
            >
              {printerStatus?.configured ? "Configured" : "Not configured"}
            </span>
          </div>

          <label className="flex flex-col gap-1.5 text-sm">
            <span className="text-muted">Printer</span>
            <div className="flex gap-2">
              <select
                value={selectedPrinter}
                onChange={(e) => setSelectedPrinter(e.target.value)}
                className="h-10 flex-1 rounded-[var(--radius-control)] border border-border bg-bg px-3 text-ink focus-visible:outline focus-visible:outline-2 focus-visible:outline-primary"
              >
                <option value="">None selected</option>
                {printers.map((p) => (
                  <option key={p.name} value={p.name}>
                    {p.displayName}
                  </option>
                ))}
              </select>
              <Button variant="secondary" onClick={loadPrinters} loading={loadingPrinters}>
                Refresh
              </Button>
            </div>
          </label>

          {printers.length === 0 && !loadingPrinters && (
            <p className="text-xs text-muted">
              No printers found. Install/pair the receipt printer in the operating system first (e.g. Windows
              Settings &gt; Printers &amp; scanners, using a &quot;Generic / Text Only&quot; or vendor driver),
              then Refresh.
            </p>
          )}

          <Button onClick={savePrinter} loading={savingPrinter} disabled={selectedPrinter === (printerStatus?.target ?? "")}>
            Save printer
          </Button>

          <label className="flex flex-col gap-1.5 text-sm">
            <span className="text-muted">Till name (shown on receipts as &quot;Device&quot;)</span>
            <div className="flex gap-2">
              <input
                value={displayName}
                onChange={(e) => setDisplayName(e.target.value)}
                placeholder="e.g. Till 1"
                className="h-10 flex-1 rounded-[var(--radius-control)] border border-border bg-bg px-3 text-ink focus-visible:outline focus-visible:outline-2 focus-visible:outline-primary"
              />
              <Button variant="secondary" onClick={saveDisplayName} loading={savingName}>
                Save
              </Button>
            </div>
          </label>

          <div className="flex flex-col gap-2">
            <Button onClick={testPrint} loading={testing} className="self-start">
              Test print
            </Button>
            {testResult && <p className="text-xs text-muted">{testResult}</p>}
          </div>
        </div>
      </div>
    </div>
  );
}
