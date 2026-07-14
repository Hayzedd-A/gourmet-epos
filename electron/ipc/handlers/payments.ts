import type { IpcMain } from "electron";
import { and, eq } from "drizzle-orm";
import { assembleSale } from "../../db/sales";
import type { getDb } from "../../db/client";
import { paymentMethodCache, sale } from "../../db/schema";
import { getTerminalConfig } from "../../db/terminal";
import { appState } from "../../state";
import { IPC_CHANNELS } from "../../../shared/types/ipc";
import type {
  PaymentMethodOption,
  PaymentReceiptCandidate,
  ReconcileSummary,
  Sale,
} from "../../../shared/types/domain";
import * as zupa from "../../zupa/client";
import { PaymentAlreadyMatchedError } from "../../zupa/client";

function requireSession() {
  if (!appState.session) {
    throw new Error("Not logged in");
  }
  return appState.session;
}

function requireApiKey(db: ReturnType<typeof getDb>): string {
  const config = getTerminalConfig(db);
  if (!config.apiKey) {
    throw new Error("Terminal not activated");
  }
  return config.apiKey;
}

/**
 * Claims a receipt with Zupa and marks the local sale matched. A 409
 * ("already matched") is treated as success per the API's own guidance —
 * the sale is marked matched locally either way.
 */
async function claimForSale(
  db: ReturnType<typeof getDb>,
  apiKey: string,
  saleId: string,
  transactionRef: string,
): Promise<void> {
  try {
    await zupa.matchPaymentReceipt(apiKey, transactionRef);
  } catch (cause) {
    if (!(cause instanceof PaymentAlreadyMatchedError)) throw cause;
  }
  db.update(sale)
    .set({ transactionRef, matchStatus: "matched", matchedAt: Date.now() })
    .where(eq(sale.id, saleId))
    .run();
}

/**
 * Opportunistic single-candidate auto-match: only claims automatically when
 * the amount+time search returns exactly one receipt — anything else (zero
 * or multiple candidates) needs a person to disambiguate via narration/
 * paidAt, so it's left for the Reconciliation page. Never throws — used both
 * fire-and-forget right after a sale (electron/ipc/handlers/sales.ts) and in
 * the best-effort bulk loop below.
 */
export async function tryAutoMatchSale(
  db: ReturnType<typeof getDb>,
  apiKey: string,
  saleId: string,
  amount: number,
  soldAt: number,
  paymentMethodId: string,
): Promise<"matched" | "ambiguous" | "none" | "error"> {
  try {
    const result = await zupa.searchPaymentReceipts(apiKey, {
      amount,
      time: new Date(soldAt).toISOString(),
      paymentMethodId,
    });
    if (result.count !== 1) {
      return result.count === 0 ? "none" : "ambiguous";
    }
    await claimForSale(db, apiKey, saleId, result.receipts[0].transactionRef);
    return "matched";
  } catch {
    return "error";
  }
}

function toDomainOption(row: { id: string; name: string; type: string | null; isActive: boolean }): PaymentMethodOption {
  return { id: row.id, name: row.name, type: row.type, isActive: row.isActive };
}

export function registerPaymentsHandlers(ipcMain: IpcMain, db: ReturnType<typeof getDb>) {
  ipcMain.handle(IPC_CHANNELS.catalogListPaymentMethods, (): PaymentMethodOption[] =>
    db.select().from(paymentMethodCache).all().map(toDomainOption),
  );

  ipcMain.handle(
    IPC_CHANNELS.paymentsSearch,
    async (
      _event,
      params: { amount: number; time?: string; paymentMethodId?: string },
    ): Promise<{ count: number; receipts: PaymentReceiptCandidate[] }> => {
      requireSession();
      return zupa.searchPaymentReceipts(requireApiKey(db), params);
    },
  );

  ipcMain.handle(
    IPC_CHANNELS.paymentsMatch,
    async (_event, saleId: string, transactionRef: string): Promise<Sale> => {
      requireSession();
      await claimForSale(db, requireApiKey(db), saleId, transactionRef);
      const row = db.select().from(sale).where(eq(sale.id, saleId)).get();
      if (!row) {
        throw new Error("Sale not found");
      }
      return assembleSale(db, row);
    },
  );

  ipcMain.handle(IPC_CHANNELS.paymentsReconcileAll, async (): Promise<ReconcileSummary> => {
    requireSession();
    const apiKey = requireApiKey(db);

    const unmatched = db
      .select()
      .from(sale)
      .where(and(eq(sale.matchStatus, "unmatched"), eq(sale.status, "completed")))
      .all();

    const summary: ReconcileSummary = { attempted: unmatched.length, matched: 0, ambiguous: 0, none: 0, errors: 0 };
    for (const row of unmatched) {
      // status: "completed" guarantees both are set.
      const outcome = await tryAutoMatchSale(db, apiKey, row.id, row.total, row.soldAt!, row.paymentMethodId!);
      if (outcome === "matched") summary.matched += 1;
      else if (outcome === "ambiguous") summary.ambiguous += 1;
      else if (outcome === "none") summary.none += 1;
      else summary.errors += 1;
    }
    return summary;
  });
}
