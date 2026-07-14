import { randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
import { productLabelFor } from "../../shared/productLabel";
import type { getDb } from "./client";
import { productCache, saleItem } from "./schema";
import type { Sale, SaleItemInput } from "../../shared/types/domain";

export interface ResolvedLineItem {
  id: string;
  productId: string;
  nameAtSale: string;
  unitPriceAtSale: number;
  quantity: number;
  lineTotal: number;
}

// Accepts either the top-level db handle or a `db.transaction(tx => ...)`
// callback's `tx` — both expose the same select/insert/delete surface these
// helpers use, but drizzle gives them structurally distinct types.
type Db = ReturnType<typeof getDb>;
type Tx = Parameters<Parameters<Db["transaction"]>[0]>[0];
type DbOrTx = Db | Tx;

/**
 * Resolves cart lines against the current product cache into sellable-at
 * snapshots (name/price frozen at this moment, like the rest of this app's
 * catalog-snapshot pattern). Shared by direct checkout (sales:create) and
 * both held-order paths (hold/finalize) so product lookup/validation only
 * lives in one place. Throws on an unknown product or non-positive quantity.
 */
export function resolveLineItems(db: DbOrTx, items: SaleItemInput[]): ResolvedLineItem[] {
  const products = db.select().from(productCache).all();
  const byId = new Map(products.map((p) => [p.id, p]));

  return items.map((item) => {
    const product = byId.get(item.productId);
    if (!product) {
      throw new Error(`Unknown product ${item.productId}`);
    }
    if (item.quantity <= 0) {
      throw new Error(`Invalid quantity for ${productLabelFor(product)}`);
    }
    return {
      id: randomUUID(),
      productId: product.id,
      nameAtSale: productLabelFor(product),
      unitPriceAtSale: product.price,
      quantity: item.quantity,
      lineTotal: product.price * item.quantity,
    };
  });
}

/** Replaces every `sale_item` row for a sale with a freshly resolved set — used whenever a held order's items change (re-hold, finalize). */
export function replaceLineItems(db: DbOrTx, saleId: string, lineItems: ResolvedLineItem[]): void {
  db.delete(saleItem).where(eq(saleItem.saleId, saleId)).run();
  db.insert(saleItem)
    .values(lineItems.map((li) => ({ ...li, saleId })))
    .run();
}

export function assembleSale(
  db: ReturnType<typeof getDb>,
  row: typeof import("./schema").sale.$inferSelect,
): Sale {
  const items = db.select().from(saleItem).where(eq(saleItem.saleId, row.id)).all();
  return {
    id: row.id,
    shiftId: row.shiftId,
    staffId: row.staffId,
    storeId: row.storeId,
    terminalId: row.terminalId,
    status: row.status,
    subtotal: row.subtotal,
    discountValue: row.discountValue,
    taxValue: row.taxValue,
    total: row.total,
    paymentMethodId: row.paymentMethodId,
    paymentMethodLabel: row.paymentMethodLabel,
    transactionRef: row.transactionRef,
    matchStatus: row.matchStatus,
    matchedAt: row.matchedAt,
    openedAt: row.openedAt,
    updatedAt: row.updatedAt,
    label: row.label,
    soldAt: row.soldAt,
    syncStatus: row.syncStatus,
    serverOrderId: row.serverOrderId,
    voidReason: row.voidReason,
    items,
  };
}
