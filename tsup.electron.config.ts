import { cpSync } from "node:fs";
import { defineConfig } from "tsup";

export default defineConfig({
  entry: {
    main: "electron/main.ts",
    preload: "electron/preload.ts",
  },
  outDir: "dist-electron",
  format: ["cjs"],
  platform: "node",
  target: "node22",
  bundle: true,
  sourcemap: true,
  clean: true,
  // better-sqlite3 ships a native .node binary; it must be required at
  // runtime from node_modules, never bundled into the JS output.
  external: ["better-sqlite3", "electron"],
  onSuccess: async () => {
    // Drizzle's migrator reads .sql files by path at runtime, so they have
    // to be copied next to the bundled main.js rather than bundled as code.
    cpSync("electron/db/migrations", "dist-electron/migrations", { recursive: true });
  },
});
