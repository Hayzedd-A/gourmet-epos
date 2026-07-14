import type { Sale } from "../../shared/types/domain";

const ESC = 0x1b;
const GS = 0x1d;

const INIT = Buffer.from([ESC, 0x40]);
const BOLD_ON = Buffer.from([ESC, 0x45, 0x01]);
const BOLD_OFF = Buffer.from([ESC, 0x45, 0x00]);
const ALIGN_CENTER = Buffer.from([ESC, 0x61, 0x01]);
const ALIGN_LEFT = Buffer.from([ESC, 0x61, 0x00]);
const CUT = Buffer.from([GS, 0x56, 0x01]);

const LINE_WIDTH = 32;

function line(text = ""): Buffer {
  return Buffer.concat([Buffer.from(text, "ascii"), Buffer.from("\n")]);
}

function twoColumn(left: string, right: string): Buffer {
  const gap = Math.max(1, LINE_WIDTH - left.length - right.length);
  return line(left + " ".repeat(gap) + right);
}

function money(n: number): string {
  return `₦${n.toLocaleString("en-NG", { minimumFractionDigits: 2 })}`;
}

/**
 * Builds a raw ESC/POS byte buffer for a receipt. Deliberately dependency
 * free (no thermal-printer SDK) — the command set for a basic text receipt
 * is small enough to hand-roll and keeps this app free of a second native
 * module. No cash-drawer kick — no cash is accepted (card/transfer only).
 *
 * `soldAt`/`paymentMethodLabel` are only null on a held (unfinalized) order
 * — printReceipt is only ever called right after a sale is completed
 * (direct checkout or held-order finalize), so both are guaranteed set here.
 */
export function buildReceiptBuffer(saleData: Sale, staffName: string): Buffer {
  const parts: Buffer[] = [INIT, ALIGN_CENTER, BOLD_ON, line("GOURMET TWIST"), BOLD_OFF];
  parts.push(line(new Date(saleData.soldAt!).toLocaleString("en-NG")));
  parts.push(line("-".repeat(LINE_WIDTH)));
  parts.push(ALIGN_LEFT);

  for (const item of saleData.items) {
    parts.push(twoColumn(item.nameAtSale, money(item.lineTotal)));
    if (item.quantity > 1) {
      parts.push(line(`  ${item.quantity} x ${money(item.unitPriceAtSale)}`));
    }
  }

  parts.push(line("-".repeat(LINE_WIDTH)));
  parts.push(twoColumn("Subtotal", money(saleData.subtotal)));
  if (saleData.discountValue > 0) {
    parts.push(twoColumn("Discount", `-${money(saleData.discountValue)}`));
  }
  parts.push(BOLD_ON, twoColumn("TOTAL", money(saleData.total)), BOLD_OFF);
  parts.push(twoColumn("Payment", saleData.paymentMethodLabel!.toUpperCase()));
  parts.push(line());
  parts.push(ALIGN_CENTER, line(`Served by ${staffName}`), line("Thank you!"));
  parts.push(line(), line(), CUT);

  return Buffer.concat(parts);
}
