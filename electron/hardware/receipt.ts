import type { Sale } from "../../shared/types/domain";
import { getLogoBitmap, LOGO_HEIGHT, LOGO_WIDTH_BYTES } from "./logo";

const ESC = 0x1b;
const GS = 0x1d;

const INIT = Buffer.from([ESC, 0x40]);
const BOLD_ON = Buffer.from([ESC, 0x45, 0x01]);
const BOLD_OFF = Buffer.from([ESC, 0x45, 0x00]);
const ALIGN_CENTER = Buffer.from([ESC, 0x61, 0x01]);
const ALIGN_LEFT = Buffer.from([ESC, 0x61, 0x00]);
// GS ! n — character size select. 0x11 = double width + double height, used
// only for the TOTAL line to match the physical receipt's noticeably larger
// total. 0x00 restores normal size.
const SIZE_DOUBLE = Buffer.from([GS, 0x21, 0x11]);
const SIZE_NORMAL = Buffer.from([GS, 0x21, 0x00]);
const CUT = Buffer.from([GS, 0x56, 0x01]);
// ESC 3 n — set line spacing to n/180". Default is ~30 (5mm); everything
// printed close together on real hardware, so this opens it up to 40 (a
// little over 5.6mm) for more breathing room between lines.
const LINE_SPACING = Buffer.from([ESC, 0x33, 40]);

// 48 characters/line — the standard column count for an 80mm printer's
// default font (Font A, 12 dots wide) at its usual ~576-dot printable
// width. Was 32 (a 58mm-paper column count), which only used about 60% of
// an 80mm roll's width — see docs/ARCHITECTURE.md §10.
export const LINE_WIDTH = 48;

// Printable width in dots for a standard 80mm thermal printer (576 dots is
// the near-universal convention across 80mm ESC/POS printers — Epson
// TM-series and generic clones alike). Used only for the solid divider
// line below; text width is governed by LINE_WIDTH (character columns)
// instead, since that's font-relative rather than dot-relative.
const PAPER_WIDTH_DOTS = 576;

// The store name stays fixed (this brand's actual wordmark, also baked into
// the logo bitmap above it) — there's only one store today. Address/phone/
// email are configurable per docs/ARCHITECTURE.md §10 (Settings > Store
// info, terminal_config.storeAddress/storePhone/storeEmail); these
// placeholders only show if a terminal somehow has none set (shouldn't
// happen post-migration, see electron/db/migrations/0002_slimy_thunderbolt.sql).
export const STORE_NAME = "GOURMET TWIST";
const FALLBACK_ADDRESS = "Address not set (Settings > Store info)";
const FALLBACK_PHONE = "-";
const FALLBACK_EMAIL = "-";

export interface StoreInfo {
  address: string | null;
  phone: string | null;
  email: string | null;
}

/**
 * GS v 0 — prints the logo as an ESC/POS raster bit image. `m = 0` (normal
 * size, no doubling). Width is sent in bytes (`LOGO_WIDTH_BYTES`), height in
 * dots (`LOGO_HEIGHT`), both little-endian 16-bit (xH/yH are always 0 here
 * since the logo is well under 256 in either dimension). See
 * docs/ARCHITECTURE.md §10 and electron/hardware/logo.ts for how the bitmap
 * itself was generated.
 */
function logoImage(): Buffer {
  const header = Buffer.from([
    GS,
    0x76,
    0x30,
    0x00,
    LOGO_WIDTH_BYTES,
    0x00,
    LOGO_HEIGHT,
    0x00,
  ]);
  return Buffer.concat([header, getLogoBitmap()]);
}

/**
 * GS k m n d1...dn — prints a barcode using the printer's own symbology
 * encoder rather than hand-rolling CODE128's symbol table/checksum
 * ourselves (a real source of clone-printer incompatibility — see
 * docs/ARCHITECTURE.md §10). `m = 73` selects CODE128 in the
 * length-prefixed command form (no NUL terminator needed); the data must
 * start with `{B` to tell the printer's encoder to use CODE128 Code Set B,
 * which maps directly to ASCII 32-127 — exactly what `receiptReference`
 * produces (`REC` + 12 uppercase hex chars), so no encoding gymnastics are
 * needed beyond that prefix.
 */
function barcode(data: string): Buffer {
  const codeB = Buffer.from(`{B${data}`, "ascii");
  const hriBelow = Buffer.from([GS, 0x48, 0x02]); // GS H 2 — human-readable text below the bars
  const height = Buffer.from([GS, 0x68, 0x50]); // GS h 80 — 80 dots tall
  // GS w 2 — module width. At this barcode's length (REC + 12 hex chars =
  // 15 CODE128-B characters => 11*(15+2)+13 = 200 modules), width 3 would be
  // 600 dots — over the 576-dot paper width (PAPER_WIDTH_DOTS above) and at
  // real risk of clipping/wrapping on the printer. Width 2 (400 dots, ~70%
  // of the paper) is the widest that reliably fits.
  const width = Buffer.from([GS, 0x77, 0x02]);
  const command = Buffer.concat([
    Buffer.from([GS, 0x6b, 0x49, codeB.length]),
    codeB,
  ]);
  return Buffer.concat([hriBelow, height, width, command]);
}

/**
 * A guaranteed-solid horizontal rule, printed as a `GS v 0` raster image
 * (a few dots tall, every bit set) spanning the full paper width — rather
 * than a repeated "-" character, whose gaps between glyphs (font-dependent,
 * not controllable) were what made the old divider look broken/dotted
 * instead of a continuous line. See docs/ARCHITECTURE.md §10.
 */
function divider(): Buffer {
  const widthBytes = Math.ceil(PAPER_WIDTH_DOTS / 8);
  const heightDots = 3;
  const header = Buffer.from([
    GS,
    0x76,
    0x30,
    0x00,
    widthBytes & 0xff,
    (widthBytes >> 8) & 0xff,
    heightDots,
    0x00,
  ]);
  const data = Buffer.alloc(widthBytes * heightDots, 0xff);
  return Buffer.concat([header, data]);
}

function line(text = ""): Buffer {
  return Buffer.concat([Buffer.from(text, "ascii"), Buffer.from("\n")]);
}

function twoColumn(left: string, right: string): Buffer {
  const gap = Math.max(1, LINE_WIDTH - left.length - right.length);
  return line(left + " ".repeat(gap) + right);
}

// Item table columns (Product | Price | Qty | Total), matching the
// reference receipt's layout — widths sum to LINE_WIDTH.
const PRODUCT_COL = 20;
const PRICE_COL = 10;
const QTY_COL = 4;
const TOTAL_COL = 14;

function tableRow(
  product: string,
  price: string,
  qty: string,
  total: string,
): Buffer {
  return line(
    product.slice(0, PRODUCT_COL).padEnd(PRODUCT_COL) +
      price.slice(0, PRICE_COL).padStart(PRICE_COL) +
      qty.slice(0, QTY_COL).padStart(QTY_COL) +
      total.slice(0, TOTAL_COL).padStart(TOTAL_COL),
  );
}

// Plain "N" rather than the ₦ glyph — see docs/ARCHITECTURE.md §10.
// `line()` writes text as raw ASCII bytes with no thermal-printer SDK in
// between; ₦ (U+20A6) doesn't fit in a byte, so it got silently truncated
// to 0xA6 — a byte many clone printers' default (double-byte) codepage reads
// as the *first half* of a two-byte character, swallowing the digit right
// after it too. "N" sidesteps the whole codepage question.
function money(n: number): string {
  return `N${n.toLocaleString("en-NG", { minimumFractionDigits: 2 })}`;
}

/** DD/MM/YYYY HH:MM:SS, matching the physical receipt exactly — hand-formatted
 * (not `toLocaleString`) so it's identical regardless of the till's OS/ICU
 * locale data. */
function formatReceiptDateTime(ms: number): string {
  const d = new Date(ms);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${pad(d.getDate())}/${pad(d.getMonth() + 1)}/${d.getFullYear()} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
}

/** Greedy word-wrap to the receipt's fixed character width. */
function wrapText(text: string, width: number): string[] {
  const words = text.split(/\s+/).filter(Boolean);
  const lines: string[] = [];
  let current = "";
  for (const word of words) {
    const candidate = current ? `${current} ${word}` : word;
    if (candidate.length > width) {
      if (current) lines.push(current);
      current = word;
    } else {
      current = candidate;
    }
  }
  if (current) lines.push(current);
  return lines;
}

/** Barcode content — CODE128 via `barcode()` above, human-readable text printed as the HRI line below it. */
function receiptReference(saleData: Sale): string {
  return `REC${saleData.id.replace(/-/g, "").slice(0, 12).toUpperCase()}`;
}

/** Same shape as `receiptReference()` above, for Settings' receipt preview (which has no real sale to reference). */
export const SAMPLE_RECEIPT_REFERENCE = "REC1A2B3C4D5E6F";

/**
 * Builds a raw ESC/POS byte buffer for a receipt. Deliberately dependency
 * free (no thermal-printer SDK) — the command set is small enough to
 * hand-roll and keeps this app free of a second native module. No
 * cash-drawer kick — no cash is accepted (card/transfer only).
 *
 * `soldAt`/`paymentMethodLabel` are only null on a held (unfinalized) order
 * — printReceipt is only ever called right after a sale is completed
 * (direct checkout or held-order finalize), so both are guaranteed set here.
 */
export function buildReceiptBuffer(
  saleData: Sale,
  staffName: string,
  terminalDisplayName: string | null,
  storeInfo: StoreInfo,
): Buffer {
  const parts: Buffer[] = [
    INIT,
    LINE_SPACING,
    ALIGN_CENTER,
    logoImage(),
    SIZE_DOUBLE,
    BOLD_ON,
    line(STORE_NAME),
    BOLD_OFF,
    SIZE_NORMAL,
  ];
  const addressLines = (storeInfo.address ?? FALLBACK_ADDRESS).split("\n");
  for (const addrLine of addressLines) parts.push(line(addrLine));
  parts.push(line(`Tel : ${storeInfo.phone ?? FALLBACK_PHONE}`));
  parts.push(line(storeInfo.email ?? FALLBACK_EMAIL));
  parts.push(divider());

  parts.push(ALIGN_LEFT);
  parts.push(line("Receipt of Purchase (Inc Tax)"));
  parts.push(twoColumn("Date", formatReceiptDateTime(saleData.soldAt!)));
  parts.push(twoColumn("Staff", staffName));
  parts.push(twoColumn("Device", terminalDisplayName ?? "Till"));
  parts.push(divider());

  parts.push(tableRow("PRODUCT", "PRICE", "QTY", "TOTAL"));
  let totalQty = 0;
  for (const item of saleData.items) {
    totalQty += item.quantity;
    // Product Name — Price/Qty/Total only appear once, alongside the first line.
    const productText = item.nameAtSale;
    const productLines = wrapText(productText, PRODUCT_COL);
    parts.push(
      tableRow(
        productLines[0] ?? "",
        money(item.unitPriceAtSale),
        String(item.quantity),
        money(item.lineTotal),
      ),
    );
    for (const extra of productLines.slice(1)) {
      parts.push(line(extra));
    }
  }
  parts.push(divider());
  parts.push(twoColumn("Total Qty", String(totalQty)));

  parts.push(divider());
  parts.push(twoColumn("Subtotal", money(saleData.subtotal)));
  if (saleData.discountValue > 0) {
    parts.push(twoColumn("Discount", `-${money(saleData.discountValue)}`));
  }
  parts.push(line("TOTAL"));
  parts.push(
    ALIGN_CENTER,
    SIZE_DOUBLE,
    BOLD_ON,
    line(money(saleData.total)),
    BOLD_OFF,
    SIZE_NORMAL,
    ALIGN_LEFT,
  );

  parts.push(divider());
  parts.push(line(`PAYMENT BY ${saleData.paymentMethodLabel!.toUpperCase()}`));
  parts.push(twoColumn("Amount", money(saleData.total)));

  parts.push(line());
  parts.push(
    ALIGN_CENTER,
    BOLD_ON,
    line("Thank you for shopping with us"),
    BOLD_OFF,
  );
  // The printer prints the human-readable text below the bars itself (GS H
  // 2 in barcode()), so the reference isn't also printed as a plain line.
  parts.push(barcode(receiptReference(saleData)));
  parts.push(line(), line(), CUT);

  return Buffer.concat(parts);
}

/**
 * Minimal receipt for Settings' "Test print" button — confirms the
 * printer/OS wiring works without needing a real sale. Also exercises the
 * logo raster image and barcode commands, so a test print doubles as a
 * check that both render correctly on the physical printer.
 */
export function buildTestPrintBuffer(storeInfo: StoreInfo): Buffer {
  const parts: Buffer[] = [
    INIT,
    LINE_SPACING,
    ALIGN_CENTER,
    logoImage(),
    SIZE_DOUBLE,
    BOLD_ON,
    line(STORE_NAME),
    BOLD_OFF,
    SIZE_NORMAL,
  ];
  const addressLines = (storeInfo.address ?? FALLBACK_ADDRESS).split("\n");
  for (const addrLine of addressLines) parts.push(line(addrLine));
  parts.push(line(`Tel : ${storeInfo.phone ?? FALLBACK_PHONE}`));
  parts.push(line(storeInfo.email ?? FALLBACK_EMAIL));
  parts.push(divider());
  parts.push(line("Test print"));
  parts.push(line(formatReceiptDateTime(Date.now())));
  parts.push(line());
  parts.push(line("If you can read this, the"));
  parts.push(line("printer is set up correctly."));
  parts.push(line());
  parts.push(barcode("TEST12345678"));
  parts.push(line(), line(), CUT);
  return Buffer.concat(parts);
}
