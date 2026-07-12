import { randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
import { hashPin } from "../auth/pin";
import type { getDb } from "./client";
import {
  baseProductCache,
  categoryCache,
  categorySizeCache,
  productCache,
  staffCache,
  syncMeta,
  terminalConfig,
} from "./schema";

const SYNC_RESOURCES = ["catalog", "staff"] as const;

/**
 * Populates a fresh local database with enough demo data (terminal identity,
 * two staff PINs, a starter catalog) to run the POS end to end before this
 * terminal has ever synced with zupa-api. Every insert is guarded so this is
 * safe to call on every app start — it only fills in what's missing.
 */
export function seed(db: ReturnType<typeof getDb>) {
  let config = db.select().from(terminalConfig).where(eq(terminalConfig.id, "default")).get();
  if (!config) {
    config = {
      id: "default",
      branchId: "demo-branch",
      terminalId: "demo-terminal-1",
      deviceSecret: randomUUID(),
      jwt: null,
    };
    db.insert(terminalConfig).values(config).run();
  }
  const deviceSecret = config.deviceSecret;

  const staffCount = db.select().from(staffCache).all().length;
  if (staffCount === 0) {
    const now = 0;
    db.insert(staffCache)
      .values([
        {
          id: randomUUID(),
          name: "Store Admin",
          pinHash: hashPin("9999", deviceSecret),
          accessRole: "admin",
          updatedAt: now,
        },
        {
          id: randomUUID(),
          name: "Cashier",
          pinHash: hashPin("1234", deviceSecret),
          accessRole: "staff",
          updatedAt: now,
        },
      ])
      .run();
  }

  const categoryCount = db.select().from(categoryCache).all().length;
  if (categoryCount === 0) {
    const breadId = randomUUID();
    const drinksId = randomUUID();
    db.insert(categoryCache)
      .values([
        { id: breadId, name: "Bread", position: 1, active: true, updatedAt: 0 },
        { id: drinksId, name: "Drinks", position: 2, active: true, updatedAt: 0 },
      ])
      .run();

    // Bread comes in sizes, each a differently-priced sellable variant.
    const breadSizes = [
      { id: randomUUID(), name: "Mini", position: 1 },
      { id: randomUUID(), name: "Regular", position: 2 },
      { id: randomUUID(), name: "Maxi", position: 3 },
    ];
    const standardSize = { id: randomUUID(), name: "Standard", position: 1 };
    db.insert(categorySizeCache)
      .values([
        ...breadSizes.map((s) => ({ ...s, categoryId: breadId, updatedAt: 0 })),
        { ...standardSize, categoryId: drinksId, updatedAt: 0 },
      ])
      .run();

    const breadBaseProducts = [
      { id: randomUUID(), name: "Original Banana Bread", prices: [2500, 4500, 7500] },
      { id: randomUUID(), name: "Chocolate Chip Banana Bread", prices: [3000, 5000, 8200] },
      { id: randomUUID(), name: "Walnut Banana Bread", prices: [3200, 5500, 8800] },
      { id: randomUUID(), name: "Cinnamon Swirl Banana Bread", prices: [3200, 5500, 8800] },
    ];
    const drinkBaseProducts = [
      { id: randomUUID(), name: "Bottled Water", price: 500 },
      { id: randomUUID(), name: "Chapman", price: 1500 },
    ];

    db.insert(baseProductCache)
      .values([
        ...breadBaseProducts.map((p) => ({
          id: p.id,
          name: p.name,
          description: null,
          categoryId: breadId,
          updatedAt: 0,
        })),
        ...drinkBaseProducts.map((p) => ({
          id: p.id,
          name: p.name,
          description: null,
          categoryId: drinksId,
          updatedAt: 0,
        })),
      ])
      .run();

    db.insert(productCache)
      .values([
        ...breadBaseProducts.flatMap((p) =>
          breadSizes.map((size, i) => ({
            id: randomUUID(),
            name: p.name,
            unitPrice: p.prices[i],
            baseProductId: p.id,
            categorySizeId: size.id,
            imageUrl: null,
            isAvailable: true,
            quantity: 20,
            updatedAt: 0,
          })),
        ),
        ...drinkBaseProducts.map((p) => ({
          id: randomUUID(),
          name: p.name,
          unitPrice: p.price,
          baseProductId: p.id,
          categorySizeId: standardSize.id,
          imageUrl: null,
          isAvailable: true,
          quantity: 50,
          updatedAt: 0,
        })),
      ])
      .run();
  }

  for (const resource of SYNC_RESOURCES) {
    const existing = db.select().from(syncMeta).where(eq(syncMeta.resource, resource)).get();
    if (!existing) {
      db.insert(syncMeta).values({ resource, lastSyncedAt: 0 }).run();
    }
  }
}
