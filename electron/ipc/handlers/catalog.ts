import type { IpcMain } from "electron";
import { eq } from "drizzle-orm";
import type { getDb } from "../../db/client";
import { baseProductCache, categoryCache, categorySizeCache, productCache } from "../../db/schema";
import { appState } from "../../state";
import { canManageCatalog } from "../../../shared/permissions";
import { IPC_CHANNELS } from "../../../shared/types/ipc";
import type {
  BaseProduct,
  Category,
  CategorySize,
  Product,
  ProductInput,
} from "../../../shared/types/domain";

function requireAdmin() {
  if (!canManageCatalog(appState.session?.accessRole)) {
    throw new Error("Admin access required");
  }
}

function toDomainProduct(row: typeof productCache.$inferSelect): Product {
  return {
    id: row.id,
    name: row.name,
    unitPrice: row.unitPrice,
    baseProductId: row.baseProductId,
    categorySizeId: row.categorySizeId,
    imageUrl: row.imageUrl,
    isAvailable: row.isAvailable,
    quantity: row.quantity,
    updatedAt: row.updatedAt,
  };
}

export function registerCatalogHandlers(ipcMain: IpcMain, db: ReturnType<typeof getDb>) {
  ipcMain.handle(IPC_CHANNELS.catalogListProducts, (): Product[] =>
    db.select().from(productCache).all().map(toDomainProduct),
  );

  ipcMain.handle(IPC_CHANNELS.catalogListBaseProducts, (): BaseProduct[] =>
    db.select().from(baseProductCache).all(),
  );

  ipcMain.handle(IPC_CHANNELS.catalogListCategories, (): Category[] =>
    db.select().from(categoryCache).all(),
  );

  ipcMain.handle(IPC_CHANNELS.catalogListCategorySizes, (): CategorySize[] =>
    db.select().from(categorySizeCache).all(),
  );

  // Local-only: adjusts this terminal's cached price/availability/stock for
  // an existing variant. Does not write through to Zupa — see ProductInput's
  // doc comment and docs/ARCHITECTURE.md §7 for why catalog creation/rename
  // still has to happen in Zupa's own admin tool for now.
  ipcMain.handle(
    IPC_CHANNELS.catalogUpdateProductLocal,
    (_event, id: string, input: ProductInput): Product => {
      requireAdmin();
      db.update(productCache)
        .set({ unitPrice: input.unitPrice, isAvailable: input.isAvailable, quantity: input.quantity })
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
