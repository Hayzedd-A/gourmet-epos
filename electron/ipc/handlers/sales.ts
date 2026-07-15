import { randomUUID } from "node:crypto";
import type { IpcMain } from "electron";
import { and, eq, gte, lte, notInArray } from "drizzle-orm";
import { assembleSale, resolveLineItems } from "../../db/sales";
import type { getDb } from "../../db/client";
import { outbox, paymentMethodCache, sale, saleItem } from "../../db/schema";
import { getTerminalConfig } from "../../db/terminal";
import { appState } from "../../state";
import { canManageCatalog, canViewAllSales } from "../../../shared/permissions";
import { IPC_CHANNELS } from "../../../shared/types/ipc";
import type { Sale, SaleInput } from "../../../shared/types/domain";
import { tryAutoMatchSale } from "./payments";

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
    if (!config.storeId) {
      throw new Error("Terminal not activated");
    }

    const method = db
      .select()
      .from(paymentMethodCache)
      .where(eq(paymentMethodCache.id, input.paymentMethodId))
      .get();
    if (!method) {
      throw new Error("Unknown payment method");
    }

    const lineItems = resolveLineItems(db, input.items);
    const subtotal = lineItems.reduce((sum, li) => sum + li.lineTotal, 0);
    const total = Math.max(0, subtotal - input.discountValue);
    const now = Date.now();

    const saleRow = {
      id: randomUUID(),
      shiftId: input.shiftId,
      staffId: session.staffId,
      storeId: config.storeId,
      terminalId: config.terminalId,
      status: "completed" as const,
      subtotal,
      discountValue: input.discountValue,
      taxValue: 0,
      total,
      paymentMethodId: method.id,
      paymentMethodLabel: method.name,
      transactionRef: null,
      matchStatus: "unmatched" as const,
      matchedAt: null,
      openedAt: now,
      updatedAt: now,
      label: null,
      soldAt: now,
      syncStatus: "pending" as const,
      serverOrderId: null,
      orderNumber: null,
      voidReason: null,
    };

    db.transaction((tx) => {
      tx.insert(sale).values(saleRow).run();
      tx.insert(saleItem)
        .values(lineItems.map((li) => ({ ...li, saleId: saleRow.id })))
        .run();
      tx.insert(outbox).values({ saleId: saleRow.id, attempts: 0, nextAttemptAt: 0, lastError: null }).run();
    });

    // Fire-and-forget: try to claim a matching Squad receipt right away if
    // we're online, without making checkout wait on the network. Anything
    // not immediately/unambiguously matched is left for the Reconciliation
    // page's end-of-day pass. See docs/ARCHITECTURE.md §8.
    if (config.apiKey) {
      void tryAutoMatchSale(db, config.apiKey, saleRow.id, saleRow.total, saleRow.soldAt, saleRow.paymentMethodId);
    }

    return assembleSale(db, saleRow);
  });

  ipcMain.handle(
    IPC_CHANNELS.salesList,
    (_event, params?: { from?: number; to?: number; staffId?: string }): Sale[] => {
      const session = requireSession();

      // Held/discarded orders live in heldOrders.list — this only ever
      // returns finalized sales (completed/voided), which always have a
      // soldAt/paymentMethodId.
      const conditions = [notInArray(sale.status, ["held", "discarded"])];
      if (params?.from) conditions.push(gte(sale.soldAt, params.from));
      if (params?.to) conditions.push(lte(sale.soldAt, params.to));

      // Staff only ever see their own sales — enforced here, not just
      // hidden client-side, regardless of what (if anything) they pass as
      // `staffId`. admin/super_admin can optionally filter by any staffId.
      if (!canViewAllSales(session.accessRole)) {
        conditions.push(eq(sale.staffId, session.staffId));
      } else if (params?.staffId) {
        conditions.push(eq(sale.staffId, params.staffId));
      }

      const rows = db.select().from(sale).where(and(...conditions)).all();

      return rows
        .sort((a, b) => (b.soldAt ?? 0) - (a.soldAt ?? 0))
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
