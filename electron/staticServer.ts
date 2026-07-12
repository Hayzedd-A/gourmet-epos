import { createServer } from "node:http";
import path from "node:path";
import serveHandler from "serve-handler";

/**
 * Serves the Next.js static export (`out/`) over localhost so the renderer
 * gets proper origin/path semantics instead of `file://`, which mishandles
 * Next's chunk and asset paths. Only used in packaged builds — dev mode
 * loads `next dev` directly for HMR.
 */
export function startStaticServer(outDir: string, port: number): Promise<string> {
  const server = createServer((req, res) =>
    serveHandler(req, res, {
      public: outDir,
      cleanUrls: true,
      trailingSlash: false,
    }),
  );

  return new Promise((resolve) => {
    server.listen(port, "127.0.0.1", () => {
      resolve(`http://127.0.0.1:${port}`);
    });
  });
}

export function resolveOutDir(appPath: string): string {
  return path.join(appPath, "out");
}
