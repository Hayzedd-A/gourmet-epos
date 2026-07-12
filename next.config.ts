import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // The renderer only talks to the app over Electron IPC — no Next.js
  // server (route handlers, server actions, SSR) is needed at runtime.
  // A static export lets Electron serve `out/` directly instead of
  // managing a second Node server process. See docs/ARCHITECTURE.md.
  output: "export",
  images: {
    unoptimized: true,
  },
};

export default nextConfig;
