import { getApi } from "./ipc/client";
import type { Sale } from "../shared/types/domain";

/**
 * Shared by the Sales and Reconciliation pages' export buttons — turns
 * whatever sales/staffNames the calling page already has (its current
 * filtered view, or a fresh unfiltered fetch for "export all") into a CSV
 * via a native Save dialog. A cancelled dialog isn't an error — it's
 * reported back as a message just like a successful save.
 */
export async function exportSalesToCsv(
  sales: Sale[],
  staffNames: Record<string, string>,
  defaultFileName: string,
): Promise<string> {
  const result = await getApi().reports.exportSalesCsv(sales, staffNames, defaultFileName);
  return result.saved ? `Saved to ${result.path}` : "Export cancelled.";
}
