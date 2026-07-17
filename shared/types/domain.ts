// staff: POS only. admin: everything except managing staff. super_admin:
// everything, including registering staff/admins — the only role that logs
// in with real Zupa credentials rather than a PIN (see Session/PinLogin).
export type AccessRole = "staff" | "admin" | "super_admin";

// Roles a super admin can hand out locally — super_admin itself isn't
// something you create, it's inherent to holding real Zupa admin credentials.
export type AssignableAccessRole = "staff" | "admin";

// Synced from GET /terminal-api/payment-methods/sync — the methods an admin
// has assigned to this terminal (e.g. "Squad POS — Counter 1", "Bank
// Transfer"). No more fixed "card"|"transfer" enum — new options are added
// centrally in Zupa. `type` is informational only ("squad_pos"|"cash"|
// "bank_transfer"|"other"); the method's Squad `merchantId` is resolved
// server-side and never sent to or stored by the terminal. See
// docs/ARCHITECTURE.md §8.
export interface PaymentMethodOption {
  id: string;
  name: string;
  type: string | null;
  isActive: boolean;
}

// A pending Squad receipt returned by POST /terminal-api/payment/search,
// searched by amount (±₦1) and sale time (±30min). `narration` (bank sender
// name) and `paidAt` are what a person uses to disambiguate when multiple
// receipts share the same amount — the terminal itself doesn't know payer
// identity. See electron/zupa/client.ts.
export interface PaymentReceiptCandidate {
  id: string;
  transactionRef: string;
  gatewayRef: string | null;
  amount: number;
  narration: string | null;
  transactionType: string | null;
  paidAt: string;
}

export type PaymentMatchStatus = "unmatched" | "matched";

// Outcome of a bulk reconciliation pass (electron/ipc/handlers/payments.ts
// tryAutoMatchSale, looped over every unmatched sale). Only exact
// single-candidate matches are auto-claimed; ambiguous/no-match sales stay
// unmatched for a person to resolve on the Reconciliation page.
export interface ReconcileSummary {
  attempted: number;
  matched: number;
  ambiguous: number;
  none: number;
  errors: number;
}

// Result of a native "Save As" export (see reports:exportSalesCsv) — `path`
// is null when the user cancels the dialog, which isn't an error.
export interface ExportResult {
  saved: boolean;
  path: string | null;
}

// "held" is a sale row that hasn't been finalized yet — covers both a
// quick-stash (park an in-progress cart, resume later) and dine-in (a
// table's running tab, added to over time). "discarded" is a held order
// abandoned before ever being finalized (never had a soldAt) — distinct
// from "voided", which undoes a real completed sale. See
// docs/ARCHITECTURE.md §9.
export type SaleStatus = "held" | "discarded" | "completed" | "voided";

export type SyncStatus = "pending" | "synced" | "failed";

export interface Session {
  staffId: string;
  name: string;
  accessRole: AccessRole;
  shiftId: string | null;
}

// Device identity against Zupa's Terminal API — separate from any person's
// session (Session above). See docs/ARCHITECTURE.md §6.
export interface TerminalStatus {
  activated: boolean;
  storeId: string | null;
  // Friendly till label (e.g. "Till 1"), editable in Settings — printed on
  // receipts as "Device". Null until someone sets one.
  displayName: string | null;
  // Store details printed on the receipt just after the store name —
  // editable in Settings > Store info. `storeAddress` may be multi-line
  // (newline-separated). Null until set (should only happen pre-migration —
  // see electron/db/migrations/0002_slimy_thunderbolt.sql).
  storeAddress: string | null;
  storePhone: string | null;
  storeEmail: string | null;
}

// A staff/admin/super_admin roster row, as shown on the Staff management
// page and used for name lookups elsewhere (e.g. the sales table).
export interface StaffMember {
  id: string;
  name: string;
  accessRole: AccessRole;
  hasPin: boolean;
}

// Local-only creation/edit of a staff or admin PIN account (see
// docs/ARCHITECTURE.md — super admins are never created this way, only
// staff/admin are).
export interface StaffInput {
  name: string;
  pin: string;
  accessRole: AssignableAccessRole;
}

// Where a product row came from — two parallel catalogs that are never
// merged in the UI (a Zupa/Terminal tab switch instead): `csv_import` and
// `manual` are both the "terminal" catalog (legacy CSV-seeded products plus
// ones added directly via Zupa's catalog-admin tool); `zupa_catalog` is
// Zupa's live store catalog. See docs/ARCHITECTURE.md §4.2.
export type ProductSource = "csv_import" | "zupa_catalog" | "manual";

// One sellable row, already fully resolved (size baked in via
// `variantDescription` — no separate base-product/size-picker step, unlike
// the older customer-requests-based model this replaces).
export interface Product {
  id: string;
  name: string;
  category: string;
  description: string | null;
  price: number;
  priceExTax: number;
  variantDescription: string | null;
  source: ProductSource;
  isAvailable: boolean;
  updatedAt: number;
}

// Local-only edit of an existing product (price/availability). Catalog
// creation/renaming/category changes still happen in Zupa's own admin
// tool (ZupaFE) — see docs/ARCHITECTURE.md §7.
export interface ProductInput {
  price: number;
  isAvailable: boolean;
}

export interface Shift {
  id: string;
  staffId: string;
  terminalId: string;
  openedAt: number;
  closedAt: number | null;
}

export interface SaleItemInput {
  productId: string;
  quantity: number;
}

export interface SaleInput {
  shiftId: string;
  items: SaleItemInput[];
  discountValue: number;
  paymentMethodId: string;
}

// Holding a cart (new) or re-holding one already in progress (`existingId`
// set — e.g. resuming, editing, then setting it aside again). `label` is
// the table/customer identifier, optional for a quick anonymous stash.
export interface HeldOrderInput {
  shiftId: string;
  items: SaleItemInput[];
  label: string | null;
  existingId?: string;
}

// Finalizing a held order into a real completed sale — payment is chosen
// here, never while held (see docs/ARCHITECTURE.md §9). `items` is the full,
// current item set (it may have changed since the order was first held).
export interface HeldOrderFinalizeInput {
  items: SaleItemInput[];
  discountValue: number;
  paymentMethodId: string;
}

export interface SaleItem {
  id: string;
  saleId: string;
  productId: string;
  nameAtSale: string;
  descriptionAtSale: string | null;
  unitPriceAtSale: number;
  quantity: number;
  lineTotal: number;
}

export interface Sale {
  id: string;
  shiftId: string;
  staffId: string;
  storeId: string;
  terminalId: string;
  status: SaleStatus;
  subtotal: number;
  discountValue: number;
  taxValue: number;
  total: number;
  // Null while `status: "held"` — set only at final checkout.
  paymentMethodId: string | null;
  paymentMethodLabel: string | null;
  transactionRef: string | null;
  matchStatus: PaymentMatchStatus;
  matchedAt: number | null;
  openedAt: number;
  updatedAt: number;
  label: string | null;
  // Null while `status: "held"` — set at finalization, not creation.
  soldAt: number | null;
  syncStatus: SyncStatus;
  serverOrderId: string | null;
  // Human-friendly order reference (e.g. "TRM-A4F9K2") from Zupa's order
  // submission response — distinct from serverOrderId (its own uuid).
  orderNumber: string | null;
  voidReason: string | null;
  items: SaleItem[];
}

export interface SyncState {
  online: boolean;
  pendingOutboxCount: number;
  lastSyncedAt: Partial<Record<"catalog" | "staff" | "paymentMethods", number>>;
  lastError: string | null;
  // Terminal activated (has an apiKey) — gates catalog sync.
  activated: boolean;
  // Super admin has connected via Zupa login (has a jwt) — unrelated to
  // catalog sync, kept for whatever still needs a person-level credential.
  authenticated: boolean;
}

// What this terminal will actually try to print to — see
// electron/hardware/printer.ts. `target` is normally the OS printer name
// picked in Settings (`terminal_config.printerName`, from `listPrinters`);
// an env var (RECEIPT_PRINTER_NAME/RECEIPT_PRINTER_DEVICE) is only a
// fallback for local dev. null (and `configured: false`) if neither is set.
export interface PrinterStatus {
  platform: string;
  configured: boolean;
  target: string | null;
}

export interface PrinterResult {
  printed: boolean;
  reason?: string;
}

// One entry from `webContents.getPrintersAsync()` — `name` is the
// OS-understood identifier (what gets stored/used for printing), `displayName`
// the friendlier label shown in the Settings dropdown.
export interface DiscoveredPrinter {
  name: string;
  displayName: string;
}

// Static, non-sale-dependent pieces needed to render an on-screen
// approximation of the receipt in Settings — there's no physical printer
// needed (or, per the barcode, even any hardware capable of showing it) to
// check the logo/layout look right. `logoPngDataUrl` is a ready-to-use
// `data:image/png;base64,...` string — a PNG re-encoding of the exact same
// monochrome bitmap the printer receives (see electron/hardware/logo.ts),
// not the original source image. `sampleReference` is a fixed stand-in for
// the real per-sale barcode content (electron/hardware/receipt.ts's
// receiptReference), rendered client-side with the `jsbarcode` library.
export interface ReceiptPreviewAssets {
  storeName: string;
  logoPngDataUrl: string;
  sampleReference: string;
  lineWidth: number;
}
