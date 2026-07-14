import type { AccessRole } from "./types/domain";

/** admin and super_admin; staff cannot manage the catalog or void sales. */
export function canManageCatalog(role: AccessRole | undefined | null): boolean {
  return role === "admin" || role === "super_admin";
}

/** Only super_admin registers/edits/removes local staff & admin PIN accounts. */
export function canManageStaff(role: AccessRole | undefined | null): boolean {
  return role === "super_admin";
}

/** admin and super_admin; staff cannot access payment reconciliation. */
export function canReconcilePayments(role: AccessRole | undefined | null): boolean {
  return role === "admin" || role === "super_admin";
}

/** admin and super_admin see every sale; staff only ever see their own — enforced server-side in sales:list, not just hidden in the UI. */
export function canViewAllSales(role: AccessRole | undefined | null): boolean {
  return role === "admin" || role === "super_admin";
}
