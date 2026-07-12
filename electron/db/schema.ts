import { sql } from "drizzle-orm";
import { integer, real, sqliteTable, text } from "drizzle-orm/sqlite-core";

// Singleton row (id is always "default") identifying this device.
// `jwt` is set by the "Connect to Zupa" admin flow (auth:connectZupa) and
// has no refresh mechanism — Zupa's admin login issues a plain expiring
// JWT with no refresh token, so re-connecting is how a stale JWT is
// replaced. See docs/ARCHITECTURE.md §6.
export const terminalConfig = sqliteTable("terminal_config", {
  id: text("id").primaryKey().default("default"),
  branchId: text("branch_id").notNull(),
  terminalId: text("terminal_id").notNull(),
  deviceSecret: text("device_secret").notNull(),
  jwt: text("jwt"),
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

// Mirrors Zupa `product_category` — a display grouping (e.g. "Bread"),
// each with its own set of size variants (see categorySizeCache).
export const categoryCache = sqliteTable("category_cache", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  position: integer("position").notNull().default(0),
  active: integer("active", { mode: "boolean" }).notNull().default(true),
  updatedAt: integer("updated_at").notNull(),
});

// Mirrors Zupa `product_category_size` — the sizes offered within a
// category (e.g. Mini/Regular/Midi/Maxi/Extra Large for "Bread").
export const categorySizeCache = sqliteTable("category_size_cache", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  position: integer("position").notNull().default(0),
  categoryId: text("category_id").notNull(),
  updatedAt: integer("updated_at").notNull(),
});

// Mirrors Zupa `base_product` — what staff actually tap in the POS grid
// (e.g. "Cinnamon Swirl Bread"). Not itself sellable; each has 1+ size
// variants in productCache below, each with its own price.
export const baseProductCache = sqliteTable("base_product_cache", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  description: text("description"),
  categoryId: text("category_id"),
  updatedAt: integer("updated_at").notNull(),
});

// Mirrors Zupa `product` — one sellable size variant of a base product,
// e.g. "Cinnamon Swirl Bread, Maxi" at its own price.
export const productCache = sqliteTable("product_cache", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  unitPrice: real("unit_price").notNull(),
  baseProductId: text("base_product_id").notNull(),
  categorySizeId: text("category_size_id"),
  imageUrl: text("image_url"),
  isAvailable: integer("is_available", { mode: "boolean" }).notNull().default(true),
  // Informational only — never enforced against a sale. See ARCHITECTURE.md §7.
  quantity: integer("quantity").notNull().default(0),
  updatedAt: integer("updated_at").notNull(),
});

export const shift = sqliteTable("shift", {
  id: text("id").primaryKey(),
  staffId: text("staff_id").notNull(),
  terminalId: text("terminal_id").notNull(),
  openedAt: integer("opened_at").notNull(),
  closedAt: integer("closed_at"),
  openingFloat: real("opening_float").notNull(),
  closingTotal: real("closing_total"),
});

// Source of truth for a completed sale. Written before any network call.
export const sale = sqliteTable("sale", {
  id: text("id").primaryKey(), // == clientReference used for upload idempotency
  shiftId: text("shift_id").notNull(),
  staffId: text("staff_id").notNull(),
  branchId: text("branch_id").notNull(),
  terminalId: text("terminal_id").notNull(),
  status: text("status", { enum: ["completed", "voided"] })
    .notNull()
    .default("completed"),
  subtotal: real("subtotal").notNull(),
  discountValue: real("discount_value").notNull().default(0),
  taxValue: real("tax_value").notNull().default(0),
  total: real("total").notNull(),
  paymentMethod: text("payment_method", { enum: ["cash", "card", "transfer"] }).notNull(),
  amountTendered: real("amount_tendered"),
  soldAt: integer("sold_at").notNull(),
  syncStatus: text("sync_status", { enum: ["pending", "synced", "failed"] })
    .notNull()
    .default("pending"),
  serverOrderId: text("server_order_id"),
  voidReason: text("void_reason"),
});

export const saleItem = sqliteTable("sale_item", {
  id: text("id").primaryKey(),
  saleId: text("sale_id").notNull(),
  productId: text("product_id").notNull(),
  nameAtSale: text("name_at_sale").notNull(),
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

// Drives incremental pulls: one row per pulled resource. "catalog" covers
// categories/sizes/base products/products together since Zupa's $search
// endpoint returns them nested in a single response.
export const syncMeta = sqliteTable("sync_meta", {
  resource: text("resource", { enum: ["catalog", "staff"] }).primaryKey(),
  lastSyncedAt: integer("last_synced_at").notNull().default(sql`0`),
});
