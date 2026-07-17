import { randomUUID } from "node:crypto";
import type { IpcMain } from "electron";
import { eq } from "drizzle-orm";
import { assembleSale, replaceLineItems, resolveLineItems } from "../../db/sales";
import type { getDb } from "../../db/client";
import { outbox, paymentMethodCache, sale } from "../../db/schema";
import { getTerminalConfig } from "../../db/terminal";
import { appState } from "../../state";
import { IPC_CHANNELS } from "../../../shared/types/ipc";
import type { HeldOrderFinalizeInput, HeldOrderInput, Sale } from "../../../shared/types/domain";
import { tryAutoMatchSale } from "./payments";

function requireSession() {
  if (!appState.session) {
    throw new Error("Not logged in");
  }
  return appState.session;
}

function requireHeldRow(db: ReturnType<typeof getDb>, id: string) {
  const row = db.select().from(sale).where(eq(sale.id, id)).get();
  if (!row) {
    throw new Error("Held order not found");
  }
  if (row.status !== "held") {
    throw new Error("This order is no longer held");
  }
  return row;
}

/**
 * A held order is just a `sale` row that hasn't been finalized — it covers
 * both a quick-stash (park an in-progress cart, resume later) and dine-in (a
 * table's running tab, added to over time). See docs/ARCHITECTURE.md §9.
 */
export function registerHeldOrdersHandlers(ipcMain: IpcMain, db: ReturnType<typeof getDb>) {
  ipcMain.handle(IPC_CHANNELS.heldOrdersList, (): Sale[] => {
    const rows = db.select().from(sale).where(eq(sale.status, "held")).all();
    return rows.sort((a, b) => a.openedAt - b.openedAt).map((row) => assembleSale(db, row));
  });

  ipcMain.handle(IPC_CHANNELS.heldOrdersHold, (_event, input: HeldOrderInput): Sale => {
    const session = requireSession();
    if (!session.shiftId || session.shiftId !== input.shiftId) {
      throw new Error("No matching open shift for this order");
    }
    if (input.items.length === 0) {
      throw new Error("A held order needs at least one item");
    }

    const config = getTerminalConfig(db);
    if (!config.storeId) {
      throw new Error("Terminal not activated");
    }

    const lineItems = resolveLineItems(db, input.items);
    const subtotal = lineItems.reduce((sum, li) => sum + li.lineTotal, 0);
    const now = Date.now();

    if (input.existingId) {
      const existing = requireHeldRow(db, input.existingId);
      db.transaction((tx) => {
        replaceLineItems(tx, existing.id, lineItems);
        tx.update(sale)
          .set({ subtotal, total: subtotal, label: input.label, updatedAt: now })
          .where(eq(sale.id, existing.id))
          .run();
      });
      const row = db.select().from(sale).where(eq(sale.id, existing.id)).get()!;
      return assembleSale(db, row);
    }

    const saleRow = {
      id: randomUUID(),
      shiftId: input.shiftId,
      staffId: session.staffId,
      storeId: config.storeId,
      terminalId: config.terminalId,
      status: "held" as const,
      subtotal,
      discountValue: 0,
      taxValue: 0,
      total: subtotal,
      paymentMethodId: null,
      paymentMethodLabel: null,
      transactionRef: null,
      matchStatus: "unmatched" as const,
      matchedAt: null,
      openedAt: now,
      updatedAt: now,
      label: input.label,
      soldAt: null,
      syncStatus: "pending" as const,
      serverOrderId: null,
      orderNumber: null,
      voidReason: null,
    };

    db.transaction((tx) => {
      tx.insert(sale).values(saleRow).run();
      replaceLineItems(tx, saleRow.id, lineItems);
    });

    return assembleSale(db, saleRow);
  });

  ipcMain.handle(IPC_CHANNELS.heldOrdersDiscard, (_event, id: string): Sale => {
    requireSession();
    requireHeldRow(db, id);

    db.update(sale)
      .set({ status: "discarded", voidReason: "Held order discarded", updatedAt: Date.now() })
      .where(eq(sale.id, id))
      .run();

    const row = db.select().from(sale).where(eq(sale.id, id)).get()!;
    return assembleSale(db, row);
  });

  ipcMain.handle(
    IPC_CHANNELS.heldOrdersFinalize,
    (_event, id: string, input: HeldOrderFinalizeInput): Sale => {
      const session = requireSession();
      if (!session.shiftId) {
        throw new Error("No open shift");
      }
      const existing = requireHeldRow(db, id);

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
      if (input.items.length === 0) {
        throw new Error("A sale needs at least one item");
      }

      const lineItems = resolveLineItems(db, input.items);
      const subtotal = lineItems.reduce((sum, li) => sum + li.lineTotal, 0);
      const total = Math.max(0, subtotal - input.discountValue);
      const now = Date.now();

      db.transaction((tx) => {
        replaceLineItems(tx, existing.id, lineItems);
        tx.update(sale)
          .set({
            status: "completed",
            subtotal,
            discountValue: input.discountValue,
            total,
            paymentMethodId: method.id,
            paymentMethodLabel: method.name,
            soldAt: now,
            updatedAt: now,
          })
          .where(eq(sale.id, existing.id))
          .run();
        tx.insert(outbox).values({ saleId: existing.id, attempts: 0, nextAttemptAt: 0, lastError: null }).run();
      });

      // Fire-and-forget, same as sales:create — see docs/ARCHITECTURE.md §8.
      if (config.apiKey && config.deviceId) {
        void tryAutoMatchSale(db, { apiKey: config.apiKey, deviceId: config.deviceId }, existing.id, total, now, method.id);
      }

      const row = db.select().from(sale).where(eq(sale.id, existing.id)).get()!;
      return assembleSale(db, row);
    },
  );
}
