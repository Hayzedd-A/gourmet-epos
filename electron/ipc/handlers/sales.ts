import { randomUUID } from "node:crypto";
import type { IpcMain } from "electron";
import { and, eq, gte, lte } from "drizzle-orm";
import { assembleSale } from "../../db/sales";
import type { getDb } from "../../db/client";
import { outbox, productCache, sale, saleItem } from "../../db/schema";
import { getTerminalConfig } from "../../db/terminal";
import { appState } from "../../state";
import { canManageCatalog } from "../../../shared/permissions";
import { IPC_CHANNELS } from "../../../shared/types/ipc";
import type { Sale, SaleInput } from "../../../shared/types/domain";

function requireSession() {
  if (!appState.session) {
    throw new Error("Not logged in");
  }
  return appState.session;
}

export function registerSalesHandlers(ipcMain: IpcMain, db: ReturnType<typeof getDb>) {
  ipcMain.handle(IPC_CHANNELS.salesCreate, (_event, input: SaleInput): Sale => {
    const session = requireSession();
    if (!session.shiftId || session.shiftId !== input.shiftId) {
      throw new Error("No matching open shift for this sale");
    }
    if (input.items.length === 0) {
      throw new Error("A sale needs at least one item");
    }

    const config = getTerminalConfig(db);
    const products = db.select().from(productCache).all();
    const byId = new Map(products.map((p) => [p.id, p]));

    const lineItems = input.items.map((item) => {
      const product = byId.get(item.productId);
      if (!product) {
        throw new Error(`Unknown product ${item.productId}`);
      }
      if (item.quantity <= 0) {
        throw new Error(`Invalid quantity for ${product.name}`);
      }
      return {
        id: randomUUID(),
        productId: product.id,
        nameAtSale: product.name,
        unitPriceAtSale: product.unitPrice,
        quantity: item.quantity,
        lineTotal: product.unitPrice * item.quantity,
      };
    });

    const subtotal = lineItems.reduce((sum, li) => sum + li.lineTotal, 0);
    const total = Math.max(0, subtotal - input.discountValue);

    if (input.paymentMethod === "cash" && (input.amountTendered ?? 0) < total) {
      throw new Error("Amount tendered is less than the total due");
    }

    const saleRow = {
      id: randomUUID(),
      shiftId: input.shiftId,
      staffId: session.staffId,
      branchId: config.branchId,
      terminalId: config.terminalId,
      status: "completed" as const,
      subtotal,
      discountValue: input.discountValue,
      taxValue: 0,
      total,
      paymentMethod: input.paymentMethod,
      amountTendered: input.amountTendered,
      soldAt: Date.now(),
      syncStatus: "pending" as const,
      serverOrderId: null,
      voidReason: null,
    };

    db.transaction((tx) => {
      tx.insert(sale).values(saleRow).run();
      tx.insert(saleItem)
        .values(lineItems.map((li) => ({ ...li, saleId: saleRow.id })))
        .run();
      tx.insert(outbox).values({ saleId: saleRow.id, attempts: 0, nextAttemptAt: 0, lastError: null }).run();
    });

    return assembleSale(db, saleRow);
  });

  ipcMain.handle(
    IPC_CHANNELS.salesList,
    (_event, params?: { from?: number; to?: number }): Sale[] => {
      const conditions = [];
      if (params?.from) conditions.push(gte(sale.soldAt, params.from));
      if (params?.to) conditions.push(lte(sale.soldAt, params.to));

      const rows = conditions.length
        ? db.select().from(sale).where(and(...conditions)).all()
        : db.select().from(sale).all();

      return rows
        .sort((a, b) => b.soldAt - a.soldAt)
        .map((row) => assembleSale(db, row));
    },
  );

  ipcMain.handle(
    IPC_CHANNELS.salesVoid,
    (_event, saleId: string, reason: string): Sale => {
      if (!canManageCatalog(appState.session?.accessRole)) {
        throw new Error("Voiding a sale requires admin access");
      }

      db.update(sale)
        .set({ status: "voided", voidReason: reason })
        .where(eq(sale.id, saleId))
        .run();

      const row = db.select().from(sale).where(eq(sale.id, saleId)).get();
      if (!row) {
        throw new Error("Sale not found");
      }
      return assembleSale(db, row);
    },
  );
}
