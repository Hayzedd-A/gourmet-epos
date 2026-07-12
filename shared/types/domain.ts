// staff: POS only. admin: everything except managing staff. super_admin:
// everything, including registering staff/admins — the only role that logs
// in with real Zupa credentials rather than a PIN (see Session/PinLogin).
export type AccessRole = "staff" | "admin" | "super_admin";

// Roles a super admin can hand out locally — super_admin itself isn't
// something you create, it's inherent to holding real Zupa admin credentials.
export type AssignableAccessRole = "staff" | "admin";

export type PaymentMethod = "cash" | "card" | "transfer";

export type SaleStatus = "completed" | "voided";

export type SyncStatus = "pending" | "synced" | "failed";

export interface Session {
  staffId: string;
  name: string;
  accessRole: AccessRole;
  shiftId: string | null;
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

// A display grouping (e.g. "Bread"). Not itself sellable.
export interface Category {
  id: string;
  name: string;
  position: number;
  active: boolean;
}

// The sizes offered within a category (e.g. Mini/Regular/Maxi for "Bread").
export interface CategorySize {
  id: string;
  name: string;
  position: number;
  categoryId: string;
}

// What staff tap in the POS grid (e.g. "Cinnamon Swirl Bread"). Not itself
// sellable — has 1+ size variants in Product below, each its own price.
export interface BaseProduct {
  id: string;
  name: string;
  description: string | null;
  categoryId: string | null;
  updatedAt: number;
}

// One sellable size variant of a base product, e.g. "Cinnamon Swirl Bread,
// Maxi" at its own price — this is what actually goes into a sale.
export interface Product {
  id: string;
  name: string;
  unitPrice: number;
  baseProductId: string;
  categorySizeId: string | null;
  imageUrl: string | null;
  isAvailable: boolean;
  quantity: number;
  updatedAt: number;
}

// Local-only edit of an existing variant (price/availability/stock).
// Catalog creation/renaming still has to happen in Zupa's own admin tool
// until its real write endpoints for this hierarchy are confirmed — see
// docs/ARCHITECTURE.md §7.
export interface ProductInput {
  unitPrice: number;
  isAvailable: boolean;
  quantity: number;
}

export interface Shift {
  id: string;
  staffId: string;
  terminalId: string;
  openedAt: number;
  closedAt: number | null;
  openingFloat: number;
  closingTotal: number | null;
}

export interface SaleItemInput {
  productId: string;
  quantity: number;
}

export interface SaleInput {
  shiftId: string;
  items: SaleItemInput[];
  discountValue: number;
  paymentMethod: PaymentMethod;
  amountTendered: number | null;
}

export interface SaleItem {
  id: string;
  saleId: string;
  productId: string;
  nameAtSale: string;
  unitPriceAtSale: number;
  quantity: number;
  lineTotal: number;
}

export interface Sale {
  id: string;
  shiftId: string;
  staffId: string;
  branchId: string;
  terminalId: string;
  status: SaleStatus;
  subtotal: number;
  discountValue: number;
  taxValue: number;
  total: number;
  paymentMethod: PaymentMethod;
  amountTendered: number | null;
  soldAt: number;
  syncStatus: SyncStatus;
  serverOrderId: string | null;
  items: SaleItem[];
}

export interface SyncState {
  online: boolean;
  pendingOutboxCount: number;
  lastSyncedAt: Partial<Record<"catalog" | "staff", number>>;
  lastError: string | null;
  authenticated: boolean;
}
