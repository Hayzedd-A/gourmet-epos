import { eq, inArray, lte } from "drizzle-orm";
import type { getDb } from "../db/client";
import { outbox, productCache, sale, saleItem } from "../db/schema";
import { getTerminalConfig } from "../db/terminal";
import * as zupa from "../zupa/client";
import type { OrderSubmitItem } from "../zupa/client";

const BASE_BACKOFF_MS = 30_000;
const MAX_BACKOFF_MS = 30 * 60_000;

function backoffFor(attempts: number): number {
  return Math.min(BASE_BACKOFF_MS * 2 ** attempts, MAX_BACKOFF_MS);
}

/**
 * Maps a sale's line items to POST /terminal-api/order/submit's item shape.
 * Confirmed via zupa-api source that `productId` is validated against the
 * `terminal_product` table specifically — **not** "any Zupa catalog
 * product" as the doc's wording suggests. That table only backs our
 * `csv_import`/`manual` sourced products (which carry a real `remoteId`);
 * `zupa_catalog` rows come from a live query against Zupa's own store
 * catalog and have no `terminal_product` counterpart, so sending their
 * `zupaProductId` as `productId` would 400 ("Product not found or
 * inactive"). Those go as ad-hoc items (name + unitPrice) instead — the
 * inverse of what the doc's description implies. A missing/hidden product
 * (shouldn't normally happen — see docs/ARCHITECTURE.md §5's hide-not-delete
 * pull behavior) falls back to ad-hoc too, using the item's own sale-time
 * snapshot, which is always safe regardless of current catalog state.
 */
export function buildOrderItems(
  db: ReturnType<typeof getDb>,
  items: (typeof saleItem.$inferSelect)[],
): OrderSubmitItem[] {
  const productIds = [...new Set(items.map((i) => i.productId))];
  const products = productIds.length
    ? db.select().from(productCache).where(inArray(productCache.id, productIds)).all()
    : [];
  const byId = new Map(products.map((p) => [p.id, p]));

  return items.map((item) => {
    const product = byId.get(item.productId);
    if (product && product.source !== "zupa_catalog" && product.remoteId) {
      return { productId: product.remoteId, quantity: item.quantity };
    }
    return { name: item.nameAtSale, unitPrice: item.unitPriceAtSale, quantity: item.quantity };
  });
}

/**
 * Drains due outbox entries, submitting each sale to Zupa's
 * `/terminal-api/order/submit` with its own id as `clientReference` (see
 * `sale.id`'s column comment). Never throws — failures stay queued for
 * retry with backoff, which is the whole point of the outbox: a sale
 * recorded offline must survive any number of failed sync attempts.
 */
export async function drainOutbox(db: ReturnType<typeof getDb>): Promise<{ pushed: number; failed: number }> {
  const config = getTerminalConfig(db);
  const due = db.select().from(outbox).where(lte(outbox.nextAttemptAt, Date.now())).all();

  let pushed = 0;
  let failed = 0;

  for (const entry of due) {
    const saleRow = db.select().from(sale).where(eq(sale.id, entry.saleId)).get();
    if (!saleRow) {
      // Sale row is gone (shouldn't happen) — nothing left to push.
      db.delete(outbox).where(eq(outbox.saleId, entry.saleId)).run();
      continue;
    }
    if (saleRow.status === "voided") {
      // Never made it to Zupa and was voided locally first — nothing to sync.
      db.delete(outbox).where(eq(outbox.saleId, entry.saleId)).run();
      continue;
    }

    try {
      if (!config.apiKey || !config.deviceId) {
        throw new Error("Terminal not activated");
      }
      const items = db.select().from(saleItem).where(eq(saleItem.saleId, saleRow.id)).all();
      const result = await zupa.submitOrder(
        { apiKey: config.apiKey, deviceId: config.deviceId },
        {
          items: buildOrderItems(db, items),
          // Both are guaranteed set: a sale only ever reaches the outbox once
          // completed (paymentMethodId is chosen at that point; transactionRef
          // is whatever's been matched so far, possibly still null).
          paymentMethodId: saleRow.paymentMethodId!,
          transactionRef: saleRow.transactionRef ?? undefined,
          paymentConfirmed: saleRow.matchStatus === "matched",
          clientReference: saleRow.id,
        },
      );
      db.update(sale)
        .set({ syncStatus: "synced", serverOrderId: result.id, orderNumber: result.orderNumber })
        .where(eq(sale.id, saleRow.id))
        .run();
      db.delete(outbox).where(eq(outbox.saleId, entry.saleId)).run();
      pushed += 1;
    } catch (cause) {
      const attempts = entry.attempts + 1;
      db.update(outbox)
        .set({
          attempts,
          nextAttemptAt: Date.now() + backoffFor(attempts),
          lastError: (cause as Error).message,
        })
        .where(eq(outbox.saleId, entry.saleId))
        .run();
      db.update(sale).set({ syncStatus: "failed" }).where(eq(sale.id, saleRow.id)).run();
      failed += 1;
    }
  }

  return { pushed, failed };
}
