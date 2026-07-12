import { writeFileSync } from "node:fs";

/**
 * Sends a raw ESC/POS buffer to the USB thermal printer. Configured via
 * RECEIPT_PRINTER_DEVICE (e.g. `/dev/usb/lp0` on Linux, where USB printer-
 * class devices show up as a writable character device). Left unconfigured
 * by default so checkout never blocks on hardware that isn't there —
 * printing is best-effort, not a requirement to complete a sale.
 *
 * Windows doesn't expose USB printers as a raw device path; wiring that up
 * means going through the OS print spooler (e.g. the `printer` native
 * module) instead of this file-write. Tracked as a follow-up once real
 * hardware is available to test against.
 */
export function sendToPrinter(buffer: Buffer): { printed: boolean; reason?: string } {
  const device = process.env.RECEIPT_PRINTER_DEVICE;
  if (!device) {
    console.log("[printer] RECEIPT_PRINTER_DEVICE not set — skipping physical print");
    return { printed: false, reason: "no printer configured" };
  }

  try {
    writeFileSync(device, buffer);
    return { printed: true };
  } catch (cause) {
    console.error("[printer] failed to write to printer device", cause);
    return { printed: false, reason: (cause as Error).message };
  }
}
