import { and, eq, isNull } from "drizzle-orm";
import type { getDb } from "./client";
import { shift } from "./schema";

export function getOpenShift(db: ReturnType<typeof getDb>, terminalId: string) {
  return (
    db
      .select()
      .from(shift)
      .where(and(eq(shift.terminalId, terminalId), isNull(shift.closedAt)))
      .get() ?? null
  );
}
