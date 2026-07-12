/**
 * Zupa API connection config. The store ID defaults to the existing
 * Gourmet Twist store (see gourmet-twist/constants in the sibling repo) —
 * override via env for other stores/tenants down the line.
 */
export const zupaConfig = {
  baseUrl: process.env.ZUPA_API_URL ?? "https://api.zupa.ng",
  storeId: process.env.ZUPA_STORE_ID ?? "8a7a28dc-b54d-4841-b949-efe60dbae709",
};
