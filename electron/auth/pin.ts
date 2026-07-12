import { createHmac } from "node:crypto";

/**
 * PINs are hashed with an HMAC keyed by this terminal's device secret
 * (electron/db/schema.ts terminalConfig.deviceSecret) rather than a
 * general-purpose password hash — the threat model is "someone glancing at
 * the SQLite file", not online brute force, since PIN login never leaves
 * the device.
 */
export function hashPin(pin: string, deviceSecret: string): string {
  return createHmac("sha256", deviceSecret).update(pin).digest("hex");
}

export function verifyPin(pin: string, deviceSecret: string, pinHash: string): boolean {
  return hashPin(pin, deviceSecret) === pinHash;
}
