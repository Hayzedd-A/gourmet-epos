import { notInArray } from "drizzle-orm";
import type { getDb } from "../db/client";
import { baseProductCache, categoryCache, categorySizeCache, productCache, syncMeta } from "../db/schema";
import { getTerminalConfig } from "../db/terminal";
import * as zupa from "../zupa/client";

/**
 * Merge, not replace: every variant returned by this pull is upserted with
 * whatever `isAvailable` Zupa reports right now (availability changes
 * constantly — sold out, back in stock, etc. — so it's always trusted as
 * current truth). A variant that existed locally before but is absent from
 * this pull entirely (discontinued, or fell out of the feed) is hidden
 * (`isAvailable = false`) rather than deleted, so it doesn't show in the POS
 * grid but stays around for admin/history purposes.
 */
export async function pullCatalog(db: ReturnType<typeof getDb>): Promise<{ pulled: number }> {
  const config = getTerminalConfig(db);
  const baseProducts = await zupa.fetchCatalog(config.jwt);
  const now = Date.now();

  const categories = new Map<string, typeof categoryCache.$inferInsert>();
  const categorySizes = new Map<string, typeof categorySizeCache.$inferInsert>();
  const baseProductRows: (typeof baseProductCache.$inferInsert)[] = [];
  const productRows: (typeof productCache.$inferInsert)[] = [];

  for (const bp of baseProducts) {
    if (bp.isDeleted) continue;

    if (bp.category) {
      categories.set(bp.category.id, {
        id: bp.category.id,
        name: bp.category.name,
        position: Number(bp.category.position) || 0,
        active: bp.category.active,
        updatedAt: now,
      });
      for (const size of bp.category.sizes ?? []) {
        categorySizes.set(size.id, {
          id: size.id,
          name: size.name,
          position: size.position,
          categoryId: size.categoryId,
          updatedAt: now,
        });
      }
    }

    baseProductRows.push({
      id: bp.id,
      name: bp.name,
      description: bp.description,
      categoryId: bp.categoryId,
      updatedAt: Date.parse(bp.updatedAt),
    });

    for (const variant of bp.products ?? []) {
      if (variant.isDeleted) continue;
      productRows.push({
        id: variant.id,
        name: variant.name,
        unitPrice: variant.unitPrice,
        baseProductId: variant.baseProductId,
        categorySizeId: variant.categorySizeId,
        imageUrl: variant.imageUrl,
        isAvailable: variant.isAvailable,
        quantity: variant.quantity,
        updatedAt: Date.parse(variant.updatedAt),
      });
    }
  }

  db.transaction((tx) => {
    for (const row of categories.values()) {
      tx.insert(categoryCache).values(row).onConflictDoUpdate({ target: categoryCache.id, set: row }).run();
    }
    for (const row of categorySizes.values()) {
      tx.insert(categorySizeCache)
        .values(row)
        .onConflictDoUpdate({ target: categorySizeCache.id, set: row })
        .run();
    }
    for (const row of baseProductRows) {
      tx.insert(baseProductCache)
        .values(row)
        .onConflictDoUpdate({ target: baseProductCache.id, set: row })
        .run();
    }
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
