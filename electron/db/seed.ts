import { randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
import { hashPin } from "../auth/pin";
import type { getDb } from "./client";
import { paymentMethodCache, productCache, staffCache, syncMeta, terminalConfig } from "./schema";

const SYNC_RESOURCES = ["catalog", "staff", "paymentMethods"] as const;

/**
 * Populates a fresh local database with enough demo data (terminal identity,
 * two staff PINs, a starter catalog) to run the POS end to end before this
 * terminal has ever been activated against Zupa's Terminal API. Every
 * insert is guarded so this is safe to call on every app start — it only
 * fills in what's missing. Demo products are tagged `source: "csv_import"`
 * (the "Terminal Products" tab) since there's no real zupa_catalog data
 * available before activation.
 */
export function seed(db: ReturnType<typeof getDb>) {
  let config = db.select().from(terminalConfig).where(eq(terminalConfig.id, "default")).get();
  if (!config) {
    config = {
      id: "default",
      terminalId: "demo-terminal-1",
      deviceSecret: randomUUID(),
      apiKey: null,
      storeId: null,
      jwt: null,
      theme: "light",
      displayName: null,
      printerName: null,
      storeAddress: "19B Fola Osibo, Lekki 1\nLagos\n10001",
      storePhone: "0701 824 9203",
      storeEmail: "hello@gourmettwist.ng",
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
          name: "Till Staff",
          pinHash: hashPin("1234", deviceSecret),
          accessRole: "staff",
          updatedAt: now,
        },
      ])
      .run();
  }

  const productCount = db.select().from(productCache).all().length;
  if (productCount === 0) {
    const breadVariants = [
      { name: "Original Banana Bread", prices: { Mini: 2500, Regular: 4500, Maxi: 7500 } },
      { name: "Chocolate Chip Banana Bread", prices: { Mini: 3000, Regular: 5000, Maxi: 8200 } },
      { name: "Walnut Banana Bread", prices: { Mini: 3200, Regular: 5500, Maxi: 8800 } },
      { name: "Cinnamon Swirl Banana Bread", prices: { Mini: 3200, Regular: 5500, Maxi: 8800 } },
    ];
    const drinks = [
      { name: "Bottled Water", price: 500 },
      { name: "Chapman", price: 1500 },
    ];

    const rows = [
      ...breadVariants.flatMap((p) =>
        Object.entries(p.prices).map(([size, price]) => ({
          id: randomUUID(),
          name: p.name,
          category: "Bread",
          description: null,
          price,
          priceExTax: price,
          variantDescription: size,
          source: "csv_import" as const,
          remoteId: null,
          zupaProductId: null,
          isAvailable: true,
          updatedAt: 0,
        })),
      ),
      ...drinks.map((p) => ({
        id: randomUUID(),
        name: p.name,
        category: "Drinks",
        description: null,
        price: p.price,
        priceExTax: p.price,
        variantDescription: "Standard",
        source: "csv_import" as const,
        remoteId: null,
        zupaProductId: null,
        isAvailable: true,
        updatedAt: 0,
      })),
    ];

    db.insert(productCache).values(rows).run();
  }

  // Placeholders for before this terminal's first successful
  // payment-methods sync (see electron/zupa/client.ts fetchPaymentMethods)
  // — keeps checkout usable out of the box. Real synced rows overwrite
  // these by id on first sync; these ids are our own until then.
  const methodCount = db.select().from(paymentMethodCache).all().length;
  if (methodCount === 0) {
    db.insert(paymentMethodCache)
      .values([
        { id: "card", name: "Card", type: "squad_pos", isActive: true, updatedAt: 0 },
        { id: "transfer", name: "Transfer", type: "bank_transfer", isActive: true, updatedAt: 0 },
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
