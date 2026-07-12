import { eq } from "drizzle-orm";
import type { getDb } from "./client";
import { saleItem } from "./schema";
import type { Sale } from "../../shared/types/domain";

export function assembleSale(
  db: ReturnType<typeof getDb>,
  row: typeof import("./schema").sale.$inferSelect,
): Sale {
  const items = db.select().from(saleItem).where(eq(saleItem.saleId, row.id)).all();
  return {
    id: row.id,
    shiftId: row.shiftId,
    staffId: row.staffId,
    branchId: row.branchId,
    terminalId: row.terminalId,
    status: row.status,
    subtotal: row.subtotal,
    discountValue: row.discountValue,
    taxValue: row.taxValue,
    total: row.total,
    paymentMethod: row.paymentMethod,
    amountTendered: row.amountTendered,
    soldAt: row.soldAt,
    syncStatus: row.syncStatus,
    serverOrderId: row.serverOrderId,
    items,
  };
}
