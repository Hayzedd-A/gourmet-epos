"use client";

import { useEffect, useRef, useState } from "react";
import JsBarcode from "jsbarcode";
import { getApi } from "@/lib/ipc/client";
import type { ReceiptPreviewAssets } from "@/shared/types/domain";

// Sample line items, purely to show where they sit relative to the
// logo/store info/barcode — not meant to match any real product or price.
// Product name only, no description — matches electron/hardware/receipt.ts's
// tableRow, which prints just nameAtSale.
const SAMPLE_ITEMS = [
  { name: "Banana Bread Loaf", qty: 1, unitPrice: 4500 },
  { name: "Cinnamon Roll", qty: 2, unitPrice: 2000 },
];

// "N" rather than ₦ — matches electron/hardware/receipt.ts's money(), whose
// comment explains why the ₦ glyph isn't safe to send to the printer.
function money(n: number): string {
  return `N${n.toLocaleString("en-NG", { minimumFractionDigits: 2 })}`;
}

/**
 * On-screen approximation of the printed receipt (electron/hardware/receipt.ts's
 * buildReceiptBuffer) — there's no physical printer needed to check the
 * logo, store info, and barcode look right. `logoPngDataUrl` is a PNG
 * re-encoding of the exact monochrome bitmap the printer receives; the
 * barcode is rendered independently client-side via `jsbarcode` (a real
 * CODE128 encoder, not the printer's own — see docs/ARCHITECTURE.md §10), so
 * it's an accurate stand-in for what the printer's own encoder will produce
 * from the same text, not a byte-for-byte copy of the print job.
 */
export function ReceiptPreview({
  storeAddress,
  storePhone,
  storeEmail,
}: {
  storeAddress: string;
  storePhone: string;
  storeEmail: string;
}) {
  const [assets, setAssets] = useState<ReceiptPreviewAssets | null>(null);
  const barcodeRef = useRef<SVGSVGElement | null>(null);

  useEffect(() => {
    let cancelled = false;
    getApi()
      .printer.getReceiptPreviewAssets()
      .then((result) => {
        if (!cancelled) setAssets(result);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!assets || !barcodeRef.current) return;
    JsBarcode(barcodeRef.current, assets.sampleReference, {
      format: "CODE128",
      displayValue: true,
      width: 1.5,
      height: 40,
      fontSize: 12,
      margin: 0,
    });
  }, [assets]);

  if (!assets) {
    return <p className="text-xs text-muted">Loading preview...</p>;
  }

  const addressLines = (storeAddress || "Address not set").split("\n");

  return (
    <div className="mx-auto w-full max-w-[320px] rounded bg-white p-4 font-mono text-[11px] leading-tight text-black shadow-sm">
      <div className="flex flex-col items-center gap-2">
        {/* eslint-disable-next-line @next/next/no-img-element -- fixed-size local data URL, not a candidate for next/image */}
        <img src={assets.logoPngDataUrl} alt="Store logo" width={96} height={96} />
        <p className="text-lg font-bold">{assets.storeName}</p>
        {addressLines.map((l, i) => (
          <p key={i}>{l}</p>
        ))}
        <p>Tel : {storePhone || "-"}</p>
        <p>{storeEmail || "-"}</p>
      </div>

      <div className="my-3 border-t-2 border-solid border-black" />

      <div className="flex flex-col gap-1">
        <p>Receipt of Purchase (Inc Tax)</p>
        <div className="flex justify-between">
          <span>Staff</span>
          <span>Jane D.</span>
        </div>
        <div className="flex justify-between">
          <span>Device</span>
          <span>Till 1</span>
        </div>
      </div>

      <div className="my-3 border-t-2 border-solid border-black" />

      <div className="grid grid-cols-[5fr_2fr_1fr_2fr] gap-x-1 font-bold">
        <span>PRODUCT</span>
        <span className="text-right">PRICE</span>
        <span className="text-right">QTY</span>
        <span className="text-right">TOTAL</span>
      </div>
      <div className="flex flex-col gap-1.5">
        {SAMPLE_ITEMS.map((item) => (
          <div key={item.name} className="grid grid-cols-[5fr_2fr_1fr_2fr] gap-x-1">
            <span>{item.name}</span>
            <span className="text-right">{money(item.unitPrice)}</span>
            <span className="text-right">{item.qty}</span>
            <span className="text-right">{money(item.qty * item.unitPrice)}</span>
          </div>
        ))}
      </div>

      <div className="my-3 border-t-2 border-solid border-black" />

      <p className="text-center font-bold">TOTAL</p>
      <p className="text-center text-lg font-bold">
        {money(SAMPLE_ITEMS.reduce((sum, item) => sum + item.qty * item.unitPrice, 0))}
      </p>

      <div className="my-3 border-t-2 border-solid border-black" />

      <p className="font-bold">PAYMENT BY MONIEPOINT 1</p>
      <div className="flex justify-between">
        <span>Amount</span>
        <span>
          {money(SAMPLE_ITEMS.reduce((sum, item) => sum + item.qty * item.unitPrice, 0))}
        </span>
      </div>

      <div className="my-3 border-t-2 border-solid border-black" />

      <p className="text-center font-bold">Thank you for shopping with us</p>
      <div className="mt-2 flex justify-center">
        <svg ref={barcodeRef} />
      </div>
    </div>
  );
}
