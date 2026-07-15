import type {
  DiscoveredPrinter,
  HeldOrderFinalizeInput,
  HeldOrderInput,
  PaymentMethodOption,
  PaymentReceiptCandidate,
  PrinterResult,
  PrinterStatus,
  Product,
  ProductInput,
  ReceiptPreviewAssets,
  ReconcileSummary,
  Sale,
  SaleInput,
  Session,
  Shift,
  StaffInput,
  StaffMember,
  SyncState,
  TerminalStatus,
} from "./domain";

/**
 * Contract exposed by electron/preload.ts as `window.api` and consumed by
 * lib/ipc/client.ts in the renderer. Keep this in sync with the
 * ipcMain.handle registrations in electron/ipc/handlers/*.
 */
export interface Api {
  // Device identity against Zupa's Terminal API — a hard gate before
  // login (see docs/ARCHITECTURE.md §6). Separate from `auth` below,
  // which is about which person is using an already-activated terminal.
  terminal: {
    getStatus(): Promise<TerminalStatus>;
    // Validates the key against the real endpoint and stores it on
    // success; throws with a clear message on an invalid/inactive key.
    activate(apiKey: string): Promise<TerminalStatus>;
    // Purely local/cosmetic till label, printed on receipts as "Device".
    // Pass null to clear it. Any logged-in role may set it.
    updateDisplayName(displayName: string | null): Promise<TerminalStatus>;
    // Store address/phone/email, printed on the receipt just after the
    // store name. Pass null (or an empty string) on any field to clear it.
    updateStoreInfo(input: { address: string | null; phone: string | null; email: string | null }): Promise<TerminalStatus>;
  };
  auth: {
    loginPin(pin: string): Promise<Session>;
    // The super admin's only login path (real Zupa email/password). As a
    // side effect this also (re)sets the terminal's Zupa sync credential —
    // see electron/ipc/handlers/auth.ts.
    loginSuperAdmin(email: string, password: string): Promise<Session>;
    getSession(): Promise<Session | null>;
    logout(): Promise<void>;
  };
  shifts: {
    // No cash is accepted, so there's nothing to reconcile at open/close —
    // a shift is just a start/end time window.
    open(): Promise<Shift>;
    close(): Promise<Shift>;
    current(): Promise<Shift | null>;
  };
  catalog: {
    // Returns every cached product (both terminal and zupa sources) — the
    // Zupa/Terminal tab split in the UI filters this client-side by
    // `source`, it's not two separate calls. See docs/ARCHITECTURE.md §5.
    listProducts(): Promise<Product[]>;
    // Local-only: adjusts a pulled product's price/availability for this
    // terminal's display. Does NOT write through to Zupa — catalog
    // creation/renaming/category changes still happen in Zupa's own admin
    // tool. See docs/ARCHITECTURE.md §7.
    updateProductLocal(id: string, input: ProductInput): Promise<Product>;
    // Synced payment methods (GET /terminal-api/payment-methods/sync) for
    // the checkout picker — see docs/ARCHITECTURE.md §8.
    listPaymentMethods(): Promise<PaymentMethodOption[]>;
  };
  sales: {
    create(input: SaleInput): Promise<Sale>;
    // Only ever returns finalized sales (completed/voided) — held orders
    // live in `heldOrders` below. See docs/ARCHITECTURE.md §9. Staff only
    // ever get their own sales back regardless of `staffId` — enforced
    // server-side, not just a UI filter; `staffId` is only honored for
    // admin/super_admin (see canViewAllSales).
    list(params?: { from?: number; to?: number; staffId?: string }): Promise<Sale[]>;
    void(saleId: string, reason: string): Promise<Sale>;
  };
  // A sale not yet finalized — covers both a quick-stash (park an
  // in-progress cart, resume later) and dine-in (a table's running tab,
  // added to over time). See docs/ARCHITECTURE.md §9.
  heldOrders: {
    // Every held order on this terminal, oldest-opened first.
    list(): Promise<Sale[]>;
    // Creates a new held order, or — with `existingId` set — replaces an
    // existing one's items/label in place (e.g. resumed, edited, held again).
    hold(input: HeldOrderInput): Promise<Sale>;
    // Abandons a held order (e.g. the table/customer never came back).
    // Distinct from `sales.void`, which is for a completed sale.
    discard(id: string): Promise<Sale>;
    // Turns a held order into a real completed sale: payment is chosen
    // here, never while held.
    finalize(id: string, input: HeldOrderFinalizeInput): Promise<Sale>;
  };
  payments: {
    // POST /terminal-api/payment/search — find pending Squad receipts by
    // amount (±₦1), sale time (±30min), and payment method (scopes the
    // Squad merchant lookup server-side).
    search(params: { amount: number; time?: string; paymentMethodId?: string }): Promise<{
      count: number;
      receipts: PaymentReceiptCandidate[];
    }>;
    // Claims a receipt for a specific sale (POST /terminal-api/payment/match)
    // and marks the sale matched locally. Returns the updated sale.
    match(saleId: string, transactionRef: string): Promise<Sale>;
    // Bulk end-of-day pass over every unmatched sale: auto-claims only when
    // the search returns exactly one candidate, leaves the rest for manual
    // review on the Reconciliation page.
    reconcileAll(): Promise<ReconcileSummary>;
  };
  staff: {
    list(): Promise<StaffMember[]>;
    // Local-only PIN accounts, super_admin-only to call. See
    // docs/ARCHITECTURE.md — super_admin itself is never created this way.
    create(input: StaffInput): Promise<StaffMember>;
    update(id: string, input: Partial<StaffInput>): Promise<StaffMember>;
    delete(id: string): Promise<void>;
  };
  sync: {
    getState(): Promise<SyncState>;
    triggerNow(): Promise<SyncState>;
  };
  printer: {
    printReceipt(saleId: string): Promise<void>;
    // What this terminal will try to print to and whether it's configured
    // — see electron/hardware/printer.ts.
    getStatus(): Promise<PrinterStatus>;
    // Prints a minimal test slip so Settings can confirm the printer/OS
    // wiring works without needing a real sale.
    testPrint(): Promise<PrinterResult>;
    // Printers the OS already knows about (Windows print spooler / CUPS),
    // for the Settings picker — see docs/ARCHITECTURE.md §10.
    listPrinters(): Promise<DiscoveredPrinter[]>;
    // Persists the chosen printer's OS name; pass null to clear it.
    setPrinterName(name: string | null): Promise<PrinterStatus>;
    // Static assets (logo PNG, store name, sample barcode text) for
    // Settings' on-screen receipt preview — see docs/ARCHITECTURE.md §10.
    getReceiptPreviewAssets(): Promise<ReceiptPreviewAssets>;
  };
}

export const IPC_CHANNELS = {
  terminalGetStatus: "terminal:getStatus",
  terminalActivate: "terminal:activate",
  terminalUpdateDisplayName: "terminal:updateDisplayName",
  terminalUpdateStoreInfo: "terminal:updateStoreInfo",
  authLoginPin: "auth:loginPin",
  authGetSession: "auth:getSession",
  authLogout: "auth:logout",
  authLoginSuperAdmin: "auth:loginSuperAdmin",
  shiftsOpen: "shifts:open",
  shiftsClose: "shifts:close",
  shiftsCurrent: "shifts:current",
  catalogListProducts: "catalog:listProducts",
  catalogUpdateProductLocal: "catalog:updateProductLocal",
  catalogListPaymentMethods: "catalog:listPaymentMethods",
  salesCreate: "sales:create",
  salesList: "sales:list",
  salesVoid: "sales:void",
  heldOrdersList: "heldOrders:list",
  heldOrdersHold: "heldOrders:hold",
  heldOrdersDiscard: "heldOrders:discard",
  heldOrdersFinalize: "heldOrders:finalize",
  paymentsSearch: "payments:search",
  paymentsMatch: "payments:match",
  paymentsReconcileAll: "payments:reconcileAll",
  staffList: "staff:list",
  staffCreate: "staff:create",
  staffUpdate: "staff:update",
  staffDelete: "staff:delete",
  syncGetState: "sync:getState",
  syncTriggerNow: "sync:triggerNow",
  printerPrintReceipt: "printer:printReceipt",
  printerGetStatus: "printer:getStatus",
  printerTestPrint: "printer:testPrint",
  printerListPrinters: "printer:listPrinters",
  printerSetPrinterName: "printer:setPrinterName",
  printerGetReceiptPreviewAssets: "printer:getReceiptPreviewAssets",
} as const;
