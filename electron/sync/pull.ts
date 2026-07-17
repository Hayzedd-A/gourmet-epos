import { notInArray } from "drizzle-orm";
import type { getDb } from "../db/client";
import { paymentMethodCache, productCache, syncMeta } from "../db/schema";
import { getTerminalConfig } from "../db/terminal";
import * as zupa from "../zupa/client";

/**
 * Merge, not replace: every product returned by this pull is upserted with
 * `isAvailable` hardcoded true (Zupa's own availability signals aren't
 * meaningful for this business — products are always available). A product
 * that existed locally before but is absent from this pull entirely is
 * hidden (`isAvailable = false`) rather than deleted, so it doesn't show in
 * the POS grid but stays around for admin/history purposes.
 *
 * Always fetches `prodType=all` in one call — both the terminal and zupa
 * catalogs are cached locally together (tagged by `source`), so the
 * Zupa/Terminal tab switch in the POS UI is an instant offline filter, not
 * a live per-tab fetch. See docs/ARCHITECTURE.md §5.
 *
 * No-ops if the terminal hasn't been activated yet (no apiKey) — the
 * background scheduler calls this unconditionally, and activation is a
 * hard gate before login, so there's nothing to pull before then.
 */
export async function pullCatalog(db: ReturnType<typeof getDb>): Promise<{ pulled: number }> {
  const config = getTerminalConfig(db);
  if (!config.apiKey || !config.deviceId) {
    return { pulled: 0 };
  }

  const response = await zupa.fetchTerminalProducts({ apiKey: config.apiKey, deviceId: config.deviceId }, "all");
  const now = Date.now();

  const productRows: (typeof productCache.$inferInsert)[] = response.products.map((p) => {
    const id = p.id ?? p.zupaProductId;
    if (!id) {
      throw new Error(`Product "${p.name}" has neither id nor zupaProductId — cannot cache it`);
    }
    return {
      id,
      name: p.name,
      category: p.category,
      description: p.description,
      price: p.price,
      priceExTax: p.priceExTax,
      variantDescription: p.variantDescription,
      source: p.source,
      remoteId: p.id,
      zupaProductId: p.zupaProductId,
      isAvailable: true,
      updatedAt: now,
    };
  });

  db.transaction((tx) => {
    for (const row of productRows) {
      tx.insert(productCache).values(row).onConflictDoUpdate({ target: productCache.id, set: row }).run();
    }

    const seenIds = productRows.map((r) => r.id);
    const hideMissing = seenIds.length
      ? tx.update(productCache).set({ isAvailable: false }).where(notInArray(productCache.id, seenIds))
      : tx.update(productCache).set({ isAvailable: false });
    hideMissing.run();

    tx.insert(syncMeta)
      .values({ resource: "catalog", lastSyncedAt: now })
      .onConflictDoUpdate({ target: syncMeta.resource, set: { lastSyncedAt: now } })
      .run();
  });

  return { pulled: productRows.length };
}

/**
 * Merge-not-replace, same pattern as pullCatalog, for payment methods. A
 * `null` response (404 — see fetchPaymentMethods) is a no-op, not a failure,
 * leaving the locally seeded defaults (db/seed.ts) and `lastSyncedAt`
 * untouched. Sync only ever returns active, assigned methods, so anything
 * cached before but absent now (unassigned/deactivated) is hidden, not
 * deleted — same reasoning as pullCatalog's hide-missing-products step.
 */
export async function pullPaymentMethods(db: ReturnType<typeof getDb>): Promise<{ pulled: number }> {
  const config = getTerminalConfig(db);
  if (!config.apiKey || !config.deviceId) {
    return { pulled: 0 };
  }

  const methods = await zupa.fetchPaymentMethods({ apiKey: config.apiKey, deviceId: config.deviceId });
  if (!methods) {
    return { pulled: 0 };
  }
  const now = Date.now();

  db.transaction((tx) => {
    for (const m of methods) {
      const row = { id: m.id, name: m.name, type: m.type, isActive: true, updatedAt: now };
      tx.insert(paymentMethodCache).values(row).onConflictDoUpdate({ target: paymentMethodCache.id, set: row }).run();
    }

    const seenIds = methods.map((m) => m.id);
    const hideMissing = seenIds.length
      ? tx.update(paymentMethodCache).set({ isActive: false }).where(notInArray(paymentMethodCache.id, seenIds))
      : tx.update(paymentMethodCache).set({ isActive: false });
    hideMissing.run();

    tx.insert(syncMeta)
      .values({ resource: "paymentMethods", lastSyncedAt: now })
      .onConflictDoUpdate({ target: syncMeta.resource, set: { lastSyncedAt: now } })
      .run();
  });

  return { pulled: methods.length };
}
