/**
 * Zupa API connection config. storeId is no longer configured here — it's
 * resolved per terminal from the activation API key (Zupa's Terminal API
 * derives store context from the key itself), see terminal_config.storeId.
 *
 * `baseUrl` is a getter, not a value baked in at import time: `.env` is
 * only loaded once `electron/main.ts` runs `import "dotenv/config"` (its
 * first line, deliberately, so it executes before any other module's
 * top-level code — see main.ts). Reading `process.env` lazily here means
 * this still works correctly even if that import ordering ever changes,
 * rather than silently capturing `undefined` at module-load time.
 */
export const zupaConfig = {
  get baseUrl() {
    return process.env.ZUPA_API_URL ?? "https://api.zupa.ng";
  },
};
