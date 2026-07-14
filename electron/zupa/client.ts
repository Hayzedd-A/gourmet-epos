import { zupaConfig } from "./config";
import type {
  PaymentMethodOption,
  PaymentReceiptCandidate,
  ProductSource,
  Sale,
} from "../../shared/types/domain";

export class ZupaApiError extends Error {}

// Thrown by matchPaymentReceipt on a 409 — per the API's own docs, this
// means the claim already went through (e.g. a retried call), not a
// failure. Callers should treat it the same as success.
export class PaymentAlreadyMatchedError extends ZupaApiError {}

async function zupaFetch<T>(
  path: string,
  jwt: string | null,
  init?: RequestInit,
): Promise<T> {
  if (!jwt) {
    throw new ZupaApiError(
      "Not authenticated with Zupa API — reconnect admin required",
    );
  }

  let response: Response;
  try {
    response = await fetch(`${zupaConfig.baseUrl}${path}`, {
      ...init,
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${jwt}`,
        ...init?.headers,
      },
    });
  } catch (cause) {
    throw new ZupaApiError(
      `Could not reach Zupa API: ${(cause as Error).message}`,
    );
  }

  if (!response.ok) {
    const body = await response.text().catch(() => "");
    throw new ZupaApiError(
      `Zupa API ${response.status} on ${path}: ${body.slice(0, 300)}`,
    );
  }

  return response.json() as Promise<T>;
}

/**
 * Calls requiring the terminal's own device identity (X-Terminal-Key), not
 * a person's JWT. See docs/ARCHITECTURE.md §6 — this is a separate auth
 * track from `zupaFetch` above.
 */
async function terminalFetch<T>(path: string, apiKey: string, init?: RequestInit): Promise<T> {
  let response: Response;
  console.log(`${zupaConfig.baseUrl}${path}`, "path");
  console.log(apiKey, "key");
  try {
    response = await fetch(`${zupaConfig.baseUrl}${path}`, {
      ...init,
      headers: {
        "x-terminal-key": apiKey,
        ...(init?.body ? { "Content-Type": "application/json" } : {}),
        ...init?.headers,
      },
    });
  } catch (cause) {
    console.log(cause, "cause");
    throw new ZupaApiError(
      `Could not reach Zupa API: ${(cause as Error).message}`,
    );
  }

  if (response.status === 401) {
    const body = await response.text().catch(() => "");
    console.log(body, "body");
    throw new ZupaApiError("Invalid or inactive terminal API key");
  }
  if (!response.ok) {
    const body = await response.text().catch(() => "");
    console.log(body, "body");
    throw new ZupaApiError(
      `Zupa API ${response.status} on ${path}: ${body.slice(0, 300)}`,
    );
  }

  return response.json() as Promise<T>;
}

export interface ZupaLoginResponse {
  jwt: string;
  user: { id: string; email?: string; firstName?: string; lastName?: string };
  accessRole?: { storeId: string; accessRole: string };
}

/**
 * `POST /auth/login` — confirmed request/response shape (no `Authorization`
 * header, since there's no session yet). Response is `{ jwt, user,
 * accessRole?, storeInfo? }`; there is no refresh token for this login path,
 * so a stale JWT is replaced by logging in again, not by refreshing.
 */
export async function login(
  email: string,
  password: string,
): Promise<ZupaLoginResponse> {
  let response: Response;
  try {
    response = await fetch(`${zupaConfig.baseUrl}/auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, password, isStore: false }),
    });
  } catch (cause) {
    throw new ZupaApiError(
      `Could not reach Zupa API: ${(cause as Error).message}`,
    );
  }

  if (!response.ok) {
    const body = await response.text().catch(() => "");
    throw new ZupaApiError(
      `Login failed (${response.status}): ${body.slice(0, 300)}`,
    );
  }

  return response.json() as Promise<ZupaLoginResponse>;
}

export type TerminalProductType = "terminal" | "zupa" | "all";

// A row from GET /terminal-api/products/:prodType — already flat, one row
// per sellable size variant. Exactly one of `id`/`zupaProductId` is
// non-null per row (real API behavior, not just the two examples we've
// seen): `id` for terminal_products rows (csv_import/manual), null with
// `zupaProductId` set for live zupa_catalog rows.
export interface ZupaTerminalProduct {
  id: string | null;
  name: string;
  category: string;
  description: string | null;
  price: number;
  priceExTax: number;
  variantDescription: string | null;
  source: ProductSource;
  zupaProductId: string | null;
}

export interface ZupaTerminalProductsResponse {
  storeId: string;
  totalProducts: number;
  categories: string[];
  products: ZupaTerminalProduct[];
  grouped: Record<string, ZupaTerminalProduct[]>;
}

/**
 * `GET /terminal-api/products/:prodType` — the real, confirmed-via-source
 * endpoint (a PDF spec floating around documents a paramless
 * `/terminal-api/products` that does NOT match the actual implementation;
 * trust this). `prodType` isn't validated server-side — anything other
 * than "terminal"/"zupa" silently behaves like "all". Store context comes
 * from the API key alone, not a request param. Always fetched as "all" here
 * (see docs/ARCHITECTURE.md §5) — the Zupa/Terminal tab split in the POS UI
 * is a client-side filter on `source`, not two separate requests.
 */
export function fetchTerminalProducts(
  apiKey: string,
  prodType: TerminalProductType = "all",
): Promise<ZupaTerminalProductsResponse> {
  return terminalFetch(`/terminal-api/products/${prodType}`, apiKey);
}

export interface PaymentSearchResponse {
  count: number;
  receipts: PaymentReceiptCandidate[];
}

/**
 * `POST /terminal-api/payment/search` — confirmed via zupa-api source
 * (src/modules/terminal/index.js). Two things the published doc gets wrong
 * or omits:
 * - The `time` window is ±30 minutes when provided, falling back to a 24h
 *   end-of-day sweep when omitted — not a fixed "last 2 hours". We always
 *   pass the sale's `soldAt` as `time` so a per-sale search stays tight.
 * - `paymentMethodId` (not a separate "account") scopes the Squad merchant
 *   lookup server-side — the terminal never resolves or sends a merchant id
 *   itself, only the method's id. Omitting it searches across all merchants.
 *
 * NOTE: as of this writing, the payment-methods feature (this field, plus
 * fetchPaymentMethods below) exists only as uncommitted changes in the
 * zupa-api working tree, not on any branch — see docs/ARCHITECTURE.md §8.
 * It's real and working against the local dev backend right now, but could
 * vanish if that working tree is reset before it's committed.
 */
export function searchPaymentReceipts(
  apiKey: string,
  params: { amount: number; time?: string; paymentMethodId?: string },
): Promise<PaymentSearchResponse> {
  return terminalFetch("/terminal-api/payment/search", apiKey, {
    method: "POST",
    body: JSON.stringify(params),
  });
}

export interface PaymentMatchResponse {
  success: boolean;
  transactionRef: string;
  amount: number;
  paidAt: string;
  matchedAt: string;
}

/**
 * `POST /terminal-api/payment/match`. Throws `PaymentAlreadyMatchedError` on
 * a 409 instead of the response body (which carries no receipt fields on
 * that status) — callers already have the receipt's data from the preceding
 * search and should treat a 409 as a successful claim.
 */
export async function matchPaymentReceipt(
  apiKey: string,
  transactionRef: string,
): Promise<PaymentMatchResponse> {
  let response: Response;
  try {
    response = await fetch(`${zupaConfig.baseUrl}/terminal-api/payment/match`, {
      method: "POST",
      headers: { "x-terminal-key": apiKey, "Content-Type": "application/json" },
      body: JSON.stringify({ transactionRef }),
    });
  } catch (cause) {
    throw new ZupaApiError(`Could not reach Zupa API: ${(cause as Error).message}`);
  }

  if (response.status === 409) {
    throw new PaymentAlreadyMatchedError("Receipt already matched — safe to treat as success");
  }
  if (response.status === 401) {
    throw new ZupaApiError("Invalid or inactive terminal API key");
  }
  if (!response.ok) {
    const body = await response.text().catch(() => "");
    throw new ZupaApiError(
      `Zupa API ${response.status} on /terminal-api/payment/match: ${body.slice(0, 300)}`,
    );
  }

  return response.json() as Promise<PaymentMatchResponse>;
}

export interface ZupaPaymentMethod {
  id: string;
  name: string;
  type: string | null;
  // Resolved server-side during payment/search — the terminal receives it
  // here but never needs to read or re-send it (see searchPaymentReceipts).
  merchantId: string | null;
  metadata: Record<string, unknown> | null;
}

export interface PaymentMethodsSyncResponse {
  paymentMethods: ZupaPaymentMethod[];
}

/**
 * `GET /terminal-api/payment-methods/sync` — the active payment methods
 * assigned to this terminal by an admin (via `PUT
 * /terminal-api/terminals/:id/payment-methods`, done in ZupaFE, not here).
 * Confirmed present in zupa-api source (models, migration, all 5
 * payment-methods routes) — but as uncommitted working-tree changes only,
 * not on any branch (see docs/ARCHITECTURE.md §8). Returns `null` (not an
 * error) on a 404 so the sync loop falls back to the locally-seeded
 * defaults (db/seed.ts) instead of failing outright, in case that working
 * tree gets reset before this lands on a real branch.
 */
export async function fetchPaymentMethods(apiKey: string): Promise<PaymentMethodOption[] | null> {
  let response: Response;
  try {
    response = await fetch(`${zupaConfig.baseUrl}/terminal-api/payment-methods/sync`, {
      headers: { "x-terminal-key": apiKey },
    });
  } catch (cause) {
    throw new ZupaApiError(`Could not reach Zupa API: ${(cause as Error).message}`);
  }

  if (response.status === 404) {
    return null;
  }
  if (response.status === 401) {
    throw new ZupaApiError("Invalid or inactive terminal API key");
  }
  if (!response.ok) {
    const body = await response.text().catch(() => "");
    throw new ZupaApiError(
      `Zupa API ${response.status} on /terminal-api/payment-methods/sync: ${body.slice(0, 300)}`,
    );
  }

  const { paymentMethods } = (await response.json()) as PaymentMethodsSyncResponse;
  // Sync only ever returns active, assigned methods — `merchantId` is
  // deliberately dropped here, not cached locally (see ZupaPaymentMethod).
  return paymentMethods.map((m) => ({ id: m.id, name: m.name, type: m.type, isActive: true }));
}

/**
 * NOT YET IMPLEMENTED server-side — tracked in docs/ARCHITECTURE.md §7.3.
 * Dedupe on `{ platform: "pos", platformOrderReference: sale.id }`, mirroring
 * the existing Slack-order idempotency pattern, once this endpoint exists.
 * Likely candidate for moving under /terminal-api with X-Terminal-Key auth
 * once built, matching the products endpoint — not assumed here since no
 * such endpoint is confirmed yet. Only ever called for a finalized sale (via
 * the outbox, which a held order is never enqueued into until it's
 * completed) — `soldAt`/`paymentMethodId`/`paymentMethodLabel` are
 * guaranteed set by then.
 */
export function pushSale(jwt: string | null, storeId: string, saleData: Sale) {
  return zupaFetch<{ id: string }>(`/pos/${storeId}/sales`, jwt, {
    method: "POST",
    body: JSON.stringify({
      platform: "pos",
      platformOrderReference: saleData.id,
      terminalId: saleData.terminalId,
      staffId: saleData.staffId,
      shiftId: saleData.shiftId,
      items: saleData.items.map((item) => ({
        productId: item.productId,
        quantity: item.quantity,
        unitPrice: item.unitPriceAtSale,
      })),
      subtotal: saleData.subtotal,
      discountValue: saleData.discountValue,
      taxValue: saleData.taxValue,
      total: saleData.total,
      paymentMethodId: saleData.paymentMethodId,
      paymentMethod: saleData.paymentMethodLabel,
      transactionRef: saleData.transactionRef,
      soldAt: new Date(saleData.soldAt!).toISOString(),
    }),
  });
}
