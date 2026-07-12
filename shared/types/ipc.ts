import type {
  BaseProduct,
  Category,
  CategorySize,
  Product,
  ProductInput,
  Sale,
  SaleInput,
  Session,
  Shift,
  StaffInput,
  StaffMember,
  SyncState,
} from "./domain";

/**
 * Contract exposed by electron/preload.ts as `window.api` and consumed by
 * lib/ipc/client.ts in the renderer. Keep this in sync with the
 * ipcMain.handle registrations in electron/ipc/handlers/*.
 */
export interface Api {
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
    open(openingFloat: number): Promise<Shift>;
    close(closingTotal: number): Promise<Shift>;
    current(): Promise<Shift | null>;
  };
  catalog: {
    listProducts(): Promise<Product[]>;
    listBaseProducts(): Promise<BaseProduct[]>;
    listCategories(): Promise<Category[]>;
    listCategorySizes(): Promise<CategorySize[]>;
    // Local-only: adjusts a pulled variant's price/availability/stock for
    // this terminal's display. Does NOT write through to Zupa — creating or
    // renaming catalog entries still has to happen in Zupa's own admin tool
    // until its real write endpoints for the base-product/size-variant
    // hierarchy are confirmed. See docs/ARCHITECTURE.md §7.
    updateProductLocal(id: string, input: ProductInput): Promise<Product>;
  };
  sales: {
    create(input: SaleInput): Promise<Sale>;
    list(params?: { from?: number; to?: number }): Promise<Sale[]>;
    void(saleId: string, reason: string): Promise<Sale>;
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
  };
}

export const IPC_CHANNELS = {
  authLoginPin: "auth:loginPin",
  authGetSession: "auth:getSession",
  authLogout: "auth:logout",
  authLoginSuperAdmin: "auth:loginSuperAdmin",
  shiftsOpen: "shifts:open",
  shiftsClose: "shifts:close",
  shiftsCurrent: "shifts:current",
  catalogListProducts: "catalog:listProducts",
  catalogListBaseProducts: "catalog:listBaseProducts",
  catalogListCategories: "catalog:listCategories",
  catalogListCategorySizes: "catalog:listCategorySizes",
  catalogUpdateProductLocal: "catalog:updateProductLocal",
  salesCreate: "sales:create",
  salesList: "sales:list",
  salesVoid: "sales:void",
  staffList: "staff:list",
  staffCreate: "staff:create",
  staffUpdate: "staff:update",
  staffDelete: "staff:delete",
  syncGetState: "sync:getState",
  syncTriggerNow: "sync:triggerNow",
  printerPrintReceipt: "printer:printReceipt",
} as const;
