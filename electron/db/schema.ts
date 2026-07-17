import { sql } from "drizzle-orm";
import { integer, real, sqliteTable, text } from "drizzle-orm/sqlite-core";

// Singleton row (id is always "default") identifying this device.
// `apiKey`/`storeId` are set by the terminal activation flow
// (terminal:activate) — a real device identity issued by Zupa's Terminal
// API (registered in ZupaFE, not by this app), sent as `X-Terminal-Key` on
// every terminal-api call. Null until activated, which is a hard gate
// before login — see docs/ARCHITECTURE.md §6. `terminalId` is a purely
// local synthetic id (shift/sale attribution only) — Zupa's real terminal
// identity is the apiKey itself, never returned to us as a separate id.
// `jwt` is unrelated: set by the super-admin login flow (a person's own
// Zupa credentials), not the terminal's device identity.
export const terminalConfig = sqliteTable("terminal_config", {
  id: text("id").primaryKey().default("default"),
  terminalId: text("terminal_id").notNull(),
  deviceSecret: text("device_secret").notNull(),
  apiKey: text("api_key"),
  storeId: text("store_id"),
  jwt: text("jwt"),
  // Set via the native View menu (electron/menu.ts), not the OS's
  // prefers-color-scheme — light is the default regardless of OS setting.
  theme: text("theme", { enum: ["light", "dark"] }).notNull().default("light"),
  // Friendly label for this physical till (e.g. "Till 1"), set in Settings.
  // Printed on receipts as "Device" — falls back to a generic label if unset
  // (see electron/hardware/receipt.ts). Purely local/cosmetic, never synced.
  displayName: text("display_name"),
  // The OS-level printer name (Electron's `PrinterInfo.name`, from
  // `webContents.getPrintersAsync()`) the user picked in Settings — e.g.
  // "EPSON TM-T88 Receipt" on Windows, a CUPS queue name on Linux. This is
  // the primary way the receipt printer gets configured now; an env var
  // (RECEIPT_PRINTER_NAME/RECEIPT_PRINTER_DEVICE) is only a fallback for
  // local dev, since there's no practical way for a real till operator to
  // set an environment variable before double-clicking a desktop shortcut.
  // See electron/hardware/printer.ts and docs/ARCHITECTURE.md §10.
  printerName: text("printer_name"),
  // Store details printed on the receipt just after the store name —
  // editable in Settings, replacing what used to be hardcoded in
  // electron/hardware/receipt.ts. `storeAddress` may be multiple lines
  // (split on "\n" for printing); phone/email are single lines. All three
  // fall back to a generic placeholder line if unset (see receipt.ts).
  storeAddress: text("store_address"),
  storePhone: text("store_phone"),
  storeEmail: text("store_email"),
  // Random UUID generated once per install (electron/db/seed.ts), sent as
  // `X-Device-Id` on every terminal-api call alongside the API key. Zupa
  // binds a terminal's apiKey to the first deviceId it validates with
  // (POST /terminal-api/auth/validate) and rejects any other deviceId
  // trying to use that same key (403) — this is what stops one leaked/
  // shared key from being used on two physical machines at once. Distinct
  // from `deviceSecret` (a local-only HMAC key for PIN hashing, never sent
  // anywhere) and from `terminalId` (a non-unique local attribution id,
  // "demo-terminal-1" on every fresh install — NOT safe to reuse here).
  deviceId: text("device_id"),
});

// Local roster: staff/admin PIN accounts (created by a super admin, see
// electron/ipc/handlers/staff.ts) plus a mirror row per super admin who has
// ever logged in on this terminal (pinHash null — they authenticate with
// real Zupa credentials instead, see electron/ipc/handlers/auth.ts). This
// gives every role a stable local id for shift/sale attribution and name
// lookups, regardless of how they logged in.
export const staffCache = sqliteTable("staff_cache", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  pinHash: text("pin_hash"),
  accessRole: text("access_role", { enum: ["staff", "admin", "super_admin"] }).notNull(),
  updatedAt: integer("updated_at").notNull(),
});

// Mirrors a row from GET /terminal-api/products/:prodType — already flat
// and fully resolved (each size variant of a product is its own row with
// its own price; no separate base-product/category-size entities exist in
// this API, unlike the older customer-requests endpoint it replaces).
// `id` is our own synthetic key: the real `remoteId` (terminal_products.id)
// when present, else `zupaProductId` — exactly one of those two is always
// non-null per row, per the API contract (see docs/ARCHITECTURE.md §4.2).
export const productCache = sqliteTable("product_cache", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  category: text("category").notNull(),
  description: text("description"),
  price: real("price").notNull(),
  priceExTax: real("price_ex_tax").notNull(),
  variantDescription: text("variant_description"),
  source: text("source", { enum: ["csv_import", "zupa_catalog", "manual"] }).notNull(),
  remoteId: text("remote_id"),
  zupaProductId: text("zupa_product_id"),
  isAvailable: integer("is_available", { mode: "boolean" }).notNull().default(true),
  updatedAt: integer("updated_at").notNull(),
});

// No cash is accepted (card/transfer only), so there's nothing to
// reconcile at open/close — a shift is just a start/end time window for
// attributing sales to a staff session.
export const shift = sqliteTable("shift", {
  id: text("id").primaryKey(),
  staffId: text("staff_id").notNull(),
  terminalId: text("terminal_id").notNull(),
  openedAt: integer("opened_at").notNull(),
  closedAt: integer("closed_at"),
});

// Mirrors GET /terminal-api/payment-methods/sync — the payment methods an
// admin has assigned to *this* terminal (e.g. "Squad POS — Counter 1",
// "Bank Transfer"). Each method carries its own Squad `merchantId` server
// side for receipt-search scoping, but the terminal never reads or stores
// that itself — only `paymentMethodId` is ever sent back to the server (see
// docs/ARCHITECTURE.md §8). Merge/hide-not-delete, same pattern as
// productCache: a method assigned before but absent from the latest sync
// (unassigned or deactivated) is hidden, not deleted.
export const paymentMethodCache = sqliteTable("payment_method_cache", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  type: text("type"),
  isActive: integer("is_active", { mode: "boolean" }).notNull().default(true),
  updatedAt: integer("updated_at").notNull(),
});

// Source of truth for a sale — including one not yet finalized. "held"
// covers both the quick-stash case (park an in-progress cart to help the
// next customer, resume later) and dine-in (a table's running tab, added to
// over time): both are just a `sale` row that hasn't become "completed" yet.
// See docs/ARCHITECTURE.md §9. Written before any network call.
export const sale = sqliteTable("sale", {
  id: text("id").primaryKey(), // == clientReference used for upload idempotency
  shiftId: text("shift_id").notNull(),
  staffId: text("staff_id").notNull(),
  storeId: text("store_id").notNull(),
  terminalId: text("terminal_id").notNull(),
  // "discarded" is a held order abandoned before ever being finalized (no
  // soldAt was ever set) — distinct from "voided", which undoes a real
  // completed sale. Keeping them separate means sales:list (real
  // transaction history) can safely assume every completed/voided row has
  // a soldAt.
  status: text("status", { enum: ["held", "discarded", "completed", "voided"] })
    .notNull()
    .default("completed"),
  subtotal: real("subtotal").notNull(),
  discountValue: real("discount_value").notNull().default(0),
  taxValue: real("tax_value").notNull().default(0),
  total: real("total").notNull(),
  // No "amount tendered"/change concept — always paid in the exact total.
  // `paymentMethodId` references paymentMethodCache; `paymentMethodLabel`
  // snapshots its name at sale time (like saleItem.nameAtSale) so a later
  // rename/deactivation upstream doesn't rewrite history. Null while
  // `status: "held"` — chosen only at final checkout, never while held.
  paymentMethodId: text("payment_method_id"),
  paymentMethodLabel: text("payment_method_label"),
  // Squad's transaction reference once a receipt is claimed via
  // POST /terminal-api/payment/match. See docs/ARCHITECTURE.md §8.
  transactionRef: text("transaction_ref"),
  matchStatus: text("match_status", { enum: ["unmatched", "matched"] })
    .notNull()
    .default("unmatched"),
  matchedAt: integer("matched_at"),
  // When this row was first created (held or otherwise) — for a held order,
  // "opened X ago" in the Held Orders list; for a direct sale, the same
  // instant as `soldAt`.
  openedAt: integer("opened_at").notNull(),
  // Bumped whenever a held order's items/label change. Same instant as
  // `openedAt` for a sale that was never held.
  updatedAt: integer("updated_at").notNull(),
  // Table/customer identifier for a held order (e.g. "Table 4"). Optional —
  // a quick stash can go unlabeled. Unused once a sale is completed/voided.
  label: text("label"),
  // Null until `status` becomes "completed" — set at finalization, not at
  // creation, so a held order's eventual sales-report date reflects when it
  // was actually paid, not when the table/stash was first opened.
  soldAt: integer("sold_at"),
  syncStatus: text("sync_status", { enum: ["pending", "synced", "failed"] })
    .notNull()
    .default("pending"),
  serverOrderId: text("server_order_id"),
  // Human-friendly order reference from POST /terminal-api/order/submit
  // (e.g. "TRM-A4F9K2") — distinct from serverOrderId (that endpoint's own
  // uuid). Set alongside serverOrderId once the push succeeds. See
  // docs/ARCHITECTURE.md §7.3.
  orderNumber: text("order_number"),
  voidReason: text("void_reason"),
});

export const saleItem = sqliteTable("sale_item", {
  id: text("id").primaryKey(),
  saleId: text("sale_id").notNull(),
  productId: text("product_id").notNull(),
  nameAtSale: text("name_at_sale").notNull(),
  // Snapshot of the product's marketing description at sale time (like
  // nameAtSale/unitPriceAtSale) — printed on the receipt under the item
  // name, matching the physical receipt format. Null if the product had no
  // description.
  descriptionAtSale: text("description_at_sale"),
  unitPriceAtSale: real("unit_price_at_sale").notNull(),
  quantity: integer("quantity").notNull(),
  lineTotal: real("line_total").notNull(),
});

// One row per sale pending push to zupa-api.
export const outbox = sqliteTable("outbox", {
  saleId: text("sale_id").primaryKey(),
  attempts: integer("attempts").notNull().default(0),
  nextAttemptAt: integer("next_attempt_at").notNull().default(0),
  lastError: text("last_error"),
});

// Drives pulls: one row per pulled resource. "catalog" covers the whole
// GET /terminal-api/products/all response (both terminal and zupa sources).
export const syncMeta = sqliteTable("sync_meta", {
  resource: text("resource", { enum: ["catalog", "staff", "paymentMethods"] }).primaryKey(),
  lastSyncedAt: integer("last_synced_at").notNull().default(sql`0`),
});
