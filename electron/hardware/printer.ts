import { execFile } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { promisify } from "node:util";
import { BrowserWindow } from "electron";

const execFileAsync = promisify(execFile);

export type PrinterResult = { printed: boolean; reason?: string };

export interface DiscoveredPrinter {
  name: string;
  displayName: string;
}

/**
 * Lists printers the OS already knows about, via Electron's own
 * `webContents.getPrintersAsync()` — works cross-platform (Windows' print
 * spooler, CUPS on Linux/macOS) with no extra dependency. This is what
 * Settings uses to let someone pick their printer from a dropdown instead of
 * needing an environment variable, which isn't practically settable before
 * double-clicking a desktop shortcut — real tills hit exactly this problem.
 * `name` is the OS-understood identifier to store/use for printing;
 * `displayName` is the friendlier label for the UI.
 */
export async function listPrinters(): Promise<DiscoveredPrinter[]> {
  const win = BrowserWindow.getAllWindows()[0];
  if (!win) {
    throw new Error("No window available to query printers");
  }
  const printers = await win.webContents.getPrintersAsync();
  return printers.map((p) => ({ name: p.name, displayName: p.displayName || p.name }));
}

/**
 * True raw-byte printing to a Windows-installed printer queue needs the
 * print spooler's RAW datatype (`WritePrinter`), which normal GDI-based
 * printing (`Out-Printer`, .NET `PrintDocument`, etc.) doesn't give you —
 * those reformat/re-encode the data instead of passing ESC/POS bytes
 * through untouched. This embeds the well-known "RawPrinterHelper" P/Invoke
 * pattern (winspool.drv OpenPrinter/StartDocPrinter[RAW]/WritePrinter) as
 * inline C#, compiled on the fly by PowerShell's own `Add-Type` — every
 * Windows install already has both, so this needs zero extra native Node
 * dependencies or a bundled compiler. The printer must be installed as a
 * Windows printer queue first (its exact name as shown in `listPrinters`
 * above / Settings > Printers & scanners), typically via a "Generic / Text
 * Only" or vendor driver.
 */
const WINDOWS_RAW_PRINT_SCRIPT = `
param(
  [Parameter(Mandatory=$true)][string]$PrinterName,
  [Parameter(Mandatory=$true)][string]$DataFile
)

$source = @"
using System;
using System.Runtime.InteropServices;

public class EposRawPrinter
{
    [StructLayout(LayoutKind.Sequential, CharSet = CharSet.Ansi)]
    public class DOCINFOA
    {
        [MarshalAs(UnmanagedType.LPStr)] public string pDocName;
        [MarshalAs(UnmanagedType.LPStr)] public string pOutputFile;
        [MarshalAs(UnmanagedType.LPStr)] public string pDataType;
    }

    [DllImport("winspool.drv", EntryPoint = "OpenPrinterA", SetLastError = true, CharSet = CharSet.Ansi, ExactSpelling = true, CallingConvention = CallingConvention.StdCall)]
    public static extern bool OpenPrinter(string szPrinter, out IntPtr hPrinter, IntPtr pd);

    [DllImport("winspool.drv", EntryPoint = "ClosePrinter", SetLastError = true, ExactSpelling = true, CallingConvention = CallingConvention.StdCall)]
    public static extern bool ClosePrinter(IntPtr hPrinter);

    [DllImport("winspool.drv", EntryPoint = "StartDocPrinterA", SetLastError = true, CharSet = CharSet.Ansi, ExactSpelling = true, CallingConvention = CallingConvention.StdCall)]
    public static extern bool StartDocPrinter(IntPtr hPrinter, int level, DOCINFOA di);

    [DllImport("winspool.drv", EntryPoint = "EndDocPrinter", SetLastError = true, ExactSpelling = true, CallingConvention = CallingConvention.StdCall)]
    public static extern bool EndDocPrinter(IntPtr hPrinter);

    [DllImport("winspool.drv", EntryPoint = "StartPagePrinter", SetLastError = true, ExactSpelling = true, CallingConvention = CallingConvention.StdCall)]
    public static extern bool StartPagePrinter(IntPtr hPrinter);

    [DllImport("winspool.drv", EntryPoint = "EndPagePrinter", SetLastError = true, ExactSpelling = true, CallingConvention = CallingConvention.StdCall)]
    public static extern bool EndPagePrinter(IntPtr hPrinter);

    [DllImport("winspool.drv", EntryPoint = "WritePrinter", SetLastError = true, ExactSpelling = true, CallingConvention = CallingConvention.StdCall)]
    public static extern bool WritePrinter(IntPtr hPrinter, IntPtr pBytes, int dwCount, out int dwWritten);

    public static bool SendBytesToPrinter(string printerName, byte[] bytes)
    {
        IntPtr hPrinter;
        if (!OpenPrinter(printerName, out hPrinter, IntPtr.Zero)) return false;
        try
        {
            DOCINFOA di = new DOCINFOA();
            di.pDocName = "epos receipt";
            di.pDataType = "RAW";
            if (!StartDocPrinter(hPrinter, 1, di)) return false;
            try
            {
                if (!StartPagePrinter(hPrinter)) return false;
                IntPtr unmanaged = Marshal.AllocCoTaskMem(bytes.Length);
                try
                {
                    Marshal.Copy(bytes, 0, unmanaged, bytes.Length);
                    int written;
                    bool ok = WritePrinter(hPrinter, unmanaged, bytes.Length, out written);
                    EndPagePrinter(hPrinter);
                    return ok && written == bytes.Length;
                }
                finally { Marshal.FreeCoTaskMem(unmanaged); }
            }
            finally { EndDocPrinter(hPrinter); }
        }
        finally { ClosePrinter(hPrinter); }
    }
}
"@

Add-Type -TypeDefinition $source -Language CSharp
$bytes = [System.IO.File]::ReadAllBytes($DataFile)
$ok = [EposRawPrinter]::SendBytesToPrinter($PrinterName, $bytes)
if (-not $ok) {
  Write-Error "WritePrinter failed for printer '$PrinterName' - check the name matches Settings, and that the printer is online."
  exit 1
}
`;

async function printOnWindows(buffer: Buffer, printerName: string): Promise<PrinterResult> {
  const tmpDir = mkdtempSync(path.join(os.tmpdir(), "epos-print-"));
  const dataFile = path.join(tmpDir, "receipt.bin");
  const scriptFile = path.join(tmpDir, "print.ps1");
  try {
    writeFileSync(dataFile, buffer);
    // Windows PowerShell 5.1 (`powershell.exe`, as opposed to PowerShell
    // Core's `pwsh`) reads a .ps1 file using the system codepage unless a
    // byte-order mark says otherwise — a stray non-ASCII character (e.g. a
    // "smart" em-dash instead of a plain hyphen) gets misread and can
    // corrupt string parsing later in the file. The UTF-8 BOM here is
    // defense-in-depth against that ever recurring; the script itself
    // should also stay plain ASCII.
    const UTF8_BOM = "﻿";
    writeFileSync(scriptFile, UTF8_BOM + WINDOWS_RAW_PRINT_SCRIPT, "utf8");
    await execFileAsync("powershell.exe", [
      "-NoProfile",
      "-NonInteractive",
      "-ExecutionPolicy",
      "Bypass",
      "-File",
      scriptFile,
      "-PrinterName",
      printerName,
      "-DataFile",
      dataFile,
    ]);
    return { printed: true };
  } catch (cause) {
    console.error("[printer] Windows raw print failed", cause);
    return { printed: false, reason: (cause as Error).message };
  } finally {
    rmSync(tmpDir, { recursive: true, force: true });
  }
}

/**
 * Raw printing via CUPS, for a printer the user picked from `listPrinters`
 * (a CUPS-registered queue) — `-o raw` tells CUPS to pass the bytes through
 * untouched rather than re-filtering them as if they were a text/PDF job,
 * same reasoning as Windows' RAW datatype above.
 */
async function printOnLinuxCups(buffer: Buffer, printerName: string): Promise<PrinterResult> {
  const tmpDir = mkdtempSync(path.join(os.tmpdir(), "epos-print-"));
  const dataFile = path.join(tmpDir, "receipt.bin");
  try {
    writeFileSync(dataFile, buffer);
    await execFileAsync("lp", ["-d", printerName, "-o", "raw", dataFile]);
    return { printed: true };
  } catch (cause) {
    console.error("[printer] CUPS raw print failed", cause);
    return { printed: false, reason: (cause as Error).message };
  } finally {
    rmSync(tmpDir, { recursive: true, force: true });
  }
}

/** Legacy/dev-only path: write straight to a USB printer-class device file (e.g. `/dev/usb/lp0`), bypassing CUPS entirely. */
function printOnLinuxDevice(buffer: Buffer, device: string): PrinterResult {
  try {
    writeFileSync(device, buffer);
    return { printed: true };
  } catch (cause) {
    console.error("[printer] failed to write to printer device", cause);
    return { printed: false, reason: (cause as Error).message };
  }
}

/**
 * Sends a raw ESC/POS buffer to the receipt printer. Best-effort by design —
 * checkout never blocks on hardware that isn't there or isn't configured,
 * printing is always fire-and-forget from the caller's side.
 *
 * `configuredPrinterName` is `terminal_config.printerName` — the OS printer
 * name picked in Settings from `listPrinters()`. This is the primary
 * configuration path on every platform now; an env var
 * (`RECEIPT_PRINTER_NAME` on Windows, `RECEIPT_PRINTER_DEVICE` on Linux/macOS
 * for the older raw-device-path approach) is only a fallback for local dev,
 * since there's no practical way for someone to set an environment variable
 * before double-clicking a desktop shortcut on a real till.
 */
export async function sendToPrinter(buffer: Buffer, configuredPrinterName: string | null): Promise<PrinterResult> {
  if (process.platform === "win32") {
    const printerName = configuredPrinterName ?? process.env.RECEIPT_PRINTER_NAME;
    if (!printerName) {
      console.log("[printer] no printer configured (Settings, or RECEIPT_PRINTER_NAME) — skipping physical print");
      return { printed: false, reason: "no printer configured" };
    }
    return printOnWindows(buffer, printerName);
  }

  if (configuredPrinterName) {
    return printOnLinuxCups(buffer, configuredPrinterName);
  }
  const device = process.env.RECEIPT_PRINTER_DEVICE;
  if (!device) {
    console.log("[printer] no printer configured (Settings, or RECEIPT_PRINTER_DEVICE) — skipping physical print");
    return { printed: false, reason: "no printer configured" };
  }
  return printOnLinuxDevice(buffer, device);
}

/** Surfaced in Settings so staff can see (and test) what this terminal will actually try to print to. */
export function getPrinterConfig(configuredPrinterName: string | null): { platform: NodeJS.Platform; target: string | null } {
  if (configuredPrinterName) {
    return { platform: process.platform, target: configuredPrinterName };
  }
  const envFallback =
    process.platform === "win32" ? (process.env.RECEIPT_PRINTER_NAME ?? null) : (process.env.RECEIPT_PRINTER_DEVICE ?? null);
  return { platform: process.platform, target: envFallback };
}
