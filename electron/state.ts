import type { Session } from "../shared/types/domain";

/**
 * In-memory, main-process-only state for this running terminal session.
 * Deliberately not persisted — logging in is a local, PIN-based action that
 * should happen fresh every time the app starts.
 */
export const appState: { session: Session | null } = {
  session: null,
};
