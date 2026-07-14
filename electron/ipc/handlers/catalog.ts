import type { IpcMain } from "electron";
import { eq } from "drizzle-orm";
import type { getDb } from "../../db/client";
import { productCache } from "../../db/schema";
import { appState } from "../../state";
import { canManageCatalog } from "../../../shared/permissions";
import { IPC_CHANNELS } from "../../../shared/types/ipc";
import type { Product, ProductInput } from "../../../shared/types/domain";

function requireAdmin() {
  if (!canManageCatalog(appState.session?.accessRole)) {
    throw new Error("Admin access required");
  }
}

function toDomainProduct(row: typeof productCache.$inferSelect): Product {
  return {
    id: row.id,
    name: row.name,
    category: row.category,
    description: row.description,
    price: row.price,
    priceExTax: row.priceExTax,
    variantDescription: row.variantDescription,
    source: row.source,
    isAvailable: row.isAvailable,
    updatedAt: row.updatedAt,
  };
}

export function registerCatalogHandlers(ipcMain: IpcMain, db: ReturnType<typeof getDb>) {
  // Both terminal and zupa sources — the Zupa/Terminal tab in the POS UI
  // filters this client-side, it isn't two separate calls.
  ipcMain.handle(IPC_CHANNELS.catalogListProducts, (): Product[] =>
    db.select().from(productCache).all().map(toDomainProduct),
  );

  // Local-only: adjusts this terminal's cached price/availability for an
  // existing product. Does not write through to Zupa — see ProductInput's
  // doc comment and docs/ARCHITECTURE.md §7 for why catalog creation/rename
  // still has to happen in Zupa's own admin tool for now.
  ipcMain.handle(
    IPC_CHANNELS.catalogUpdateProductLocal,
    (_event, id: string, input: ProductInput): Product => {
      requireAdmin();
      db.update(productCache)
        .set({ price: input.price, isAvailable: input.isAvailable })
        .where(eq(productCache.id, id))
        .run();
      const row = db.select().from(productCache).where(eq(productCache.id, id)).get();
      if (!row) {
        throw new Error("Product not found");
      }
      return toDomainProduct(row);
    },
  );
}
