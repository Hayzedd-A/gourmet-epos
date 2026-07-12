import { eq } from "drizzle-orm";
import type { getDb } from "./client";
import { terminalConfig } from "./schema";

export function getTerminalConfig(db: ReturnType<typeof getDb>) {
  const config = db.select().from(terminalConfig).where(eq(terminalConfig.id, "default")).get();
  if (!config) {
    throw new Error("Terminal is not provisioned — no terminal_config row found");
  }
  return config;
}
