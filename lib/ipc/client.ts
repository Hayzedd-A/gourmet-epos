/** Thin accessor so components don't reach for the `window` global directly. */
export function getApi() {
  if (typeof window === "undefined" || !window.api) {
    throw new Error(
      "window.api is unavailable — this app only runs inside the Electron shell (see electron/preload.ts). " +
        "Launch it with `npm run dev`, not by opening the Next.js dev URL in a plain browser tab.",
    );
  }
  return window.api;
}
