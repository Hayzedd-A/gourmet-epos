import { eq, lte } from "drizzle-orm";
import type { getDb } from "../db/client";
import { assembleSale } from "../db/sales";
import { outbox, sale } from "../db/schema";
import { getTerminalConfig } from "../db/terminal";
import * as zupa from "../zupa/client";

const BASE_BACKOFF_MS = 30_000;
const MAX_BACKOFF_MS = 30 * 60_000;

function backoffFor(attempts: number): number {
  return Math.min(BASE_BACKOFF_MS * 2 ** attempts, MAX_BACKOFF_MS);
}

/**
 * Drains due outbox entries, pushing each sale to Zupa with its clientId
 * (`sale.id`) as the idempotency key. Never throws — failures stay queued
 * for retry with backoff, which is the whole point of the outbox: a sale
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
      const result = await zupa.pushSale(config.jwt, saleRow.storeId, assembleSale(db, saleRow));
      db.update(sale)
        .set({ syncStatus: "synced", serverOrderId: result.id })
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
