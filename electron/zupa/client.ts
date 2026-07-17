import { zupaConfig } from "./config";
import type { PaymentMethodOption, PaymentReceiptCandidate, ProductSource } from "../../shared/types/domain";

export class ZupaApiError extends Error {}

// Thrown by matchPaymentReceipt on a 409 — per the API's own docs, this
// means the claim already went through (e.g. a retried call), not a
// failure. Callers should treat it the same as success.
export class PaymentAlreadyMatchedError extends ZupaApiError {}

/**
 * Thrown on a 403 from any terminal-api call — Zupa binds a terminal's
 * apiKey to the first deviceId it validates with (see validateTerminal
 * below) and rejects every other deviceId trying to use that key. In
 * practice this means either: this device was never validated yet, or the
 * key is now bound to a *different* physical device (e.g. the key leaked,
 * or this install's local deviceId was reset/backfilled after already
 * binding elsewhere) — the fix is always re-entering a (possibly freshly
 * rotated) API key in Settings, which re-runs validateTerminal. Message
 * text comes straight from the server, which is already specific about
 * which of those two cases applies.
 */
export class DeviceMismatchError extends ZupaApiError {}

/**
 * The terminal's own device identity, sent on every terminal-api call —
 * not a person's JWT. See docs/ARCHITECTURE.md §6 — a person's `jwt` (set
 * by `auth:loginSuperAdmin`) isn't used for any outbound Zupa call today;
 * it only proves this person holds real Zupa admin credentials, nothing
 * more. `deviceId` is `terminal_config.deviceId` (electron/db/schema.ts) —
 * a random UUID generated once per install, distinct from the apiKey
 * itself.
 */
export interface TerminalCredentials {
  apiKey: string;
  deviceId: string;
}

function terminalHeaders(creds: TerminalCredentials, hasBody: boolean): HeadersInit {
  return {
    "x-terminal-key": creds.apiKey,
    "x-device-id": creds.deviceId,
    ...(hasBody ? { "Content-Type": "application/json" } : {}),
  };
}

async function handleTerminalError(response: Response, path: string): Promise<never> {
  const body = await response.text().catch(() => "");
  // The server's error responses are `{ message: "..." }` — surfaced
  // as-is where it matters (e.g. Settings' revalidate result), so this is
  // worth unwrapping rather than showing the raw JSON.
  const message = ((): string | null => {
    try {
      const parsed = JSON.parse(body) as { message?: unknown };
      return typeof parsed.message === "string" ? parsed.message : null;
    } catch {
      return null;
    }
  })();

  if (response.status === 401) {
    throw new ZupaApiError("Invalid or inactive terminal API key");
  }
  if (response.status === 403) {
    throw new DeviceMismatchError(message ?? "This device isn't validated for this terminal's API key");
  }
  throw new ZupaApiError(`Zupa API ${response.status} on ${path}: ${(message ?? body).slice(0, 300)}`);
}

async function terminalFetch<T>(path: string, creds: TerminalCredentials, init?: RequestInit): Promise<T> {
  let response: Response;
  try {
    response = await fetch(`${zupaConfig.baseUrl}${path}`, {
      ...init,
      headers: {
        ...terminalHeaders(creds, Boolean(init?.body)),
        ...init?.headers,
      },
    });
  } catch (cause) {
    throw new ZupaApiError(
      `Could not reach Zupa API: ${(cause as Error).message}`,
    );
  }

  if (!response.ok) {
    await handleTerminalError(response, path);
  }

  return response.json() as Promise<T>;
}

export interface ValidateTerminalResponse {
  terminal: { id: string; name: string; storeId: string; metadata: Record<string, unknown> | null };
  paymentMethods: ZupaPaymentMethod[];
}

/**
 * `POST /terminal-api/auth/validate` — binds `creds.apiKey` to
 * `creds.deviceId` on first use, or confirms the pairing already matches on
 * every call after (both succeed the same way from here). Rejects with
 * `DeviceMismatchError` (403) if that apiKey is already bound to a
 * *different* deviceId — the only fix on the server side is rotating the
 * key, then re-calling this with the new one (see electron/ipc/handlers/
 * terminal.ts's terminalActivate, which both first-activates and
 * re-validates through this same call).
 *
 * `deviceId` goes in the body here, not the `X-Device-Id` header every
 * other terminal-api call uses — this is the one endpoint that's still
 * establishing the pairing, so there's nothing to compare a header against
 * yet server-side.
 */
export async function validateTerminal(creds: TerminalCredentials): Promise<ValidateTerminalResponse> {
  let response: Response;
  try {
    response = await fetch(`${zupaConfig.baseUrl}/terminal-api/auth/validate`, {
      method: "POST",
      headers: { "x-terminal-key": creds.apiKey, "Content-Type": "application/json" },
      body: JSON.stringify({ deviceId: creds.deviceId }),
    });
  } catch (cause) {
    throw new ZupaApiError(`Could not reach Zupa API: ${(cause as Error).message}`);
  }

  if (!response.ok) {
    await handleTerminalError(response, "/terminal-api/auth/validate");
  }

  return response.json() as Promise<ValidateTerminalResponse>;
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
  creds: TerminalCredentials,
  prodType: TerminalProductType = "all",
): Promise<ZupaTerminalProductsResponse> {
  return terminalFetch(`/terminal-api/products/${prodType}`, creds);
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
  creds: TerminalCredentials,
  params: { amount: number; time?: string; paymentMethodId?: string },
): Promise<PaymentSearchResponse> {
  return terminalFetch("/terminal-api/payment/search", creds, {
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
  creds: TerminalCredentials,
  transactionRef: string,
): Promise<PaymentMatchResponse> {
  let response: Response;
  try {
    response = await fetch(`${zupaConfig.baseUrl}/terminal-api/payment/match`, {
      method: "POST",
      headers: terminalHeaders(creds, true),
      body: JSON.stringify({ transactionRef }),
    });
  } catch (cause) {
    throw new ZupaApiError(`Could not reach Zupa API: ${(cause as Error).message}`);
  }

  if (response.status === 409) {
    throw new PaymentAlreadyMatchedError("Receipt already matched — safe to treat as success");
  }
  if (!response.ok) {
    await handleTerminalError(response, "/terminal-api/payment/match");
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
export async function fetchPaymentMethods(creds: TerminalCredentials): Promise<PaymentMethodOption[] | null> {
  let response: Response;
  try {
    response = await fetch(`${zupaConfig.baseUrl}/terminal-api/payment-methods/sync`, {
      headers: terminalHeaders(creds, false),
    });
  } catch (cause) {
    throw new ZupaApiError(`Could not reach Zupa API: ${(cause as Error).message}`);
  }

  if (response.status === 404) {
    return null;
  }
  if (!response.ok) {
    await handleTerminalError(response, "/terminal-api/payment-methods/sync");
  }

  const { paymentMethods } = (await response.json()) as PaymentMethodsSyncResponse;
  // Sync only ever returns active, assigned methods — `merchantId` is
  // deliberately dropped here, not cached locally (see ZupaPaymentMethod).
  return paymentMethods.map((m) => ({ id: m.id, name: m.name, type: m.type, isActive: true }));
}

export interface OrderSubmitItem {
  // Present only for a terminal-catalog product (source csv_import/manual —
  // see submitOrderInputFor in electron/sync/push.ts for why zupa_catalog
  // items never set this). Omitted (with name+unitPrice instead) for an
  // ad-hoc line — the server looks up price itself when productId is set,
  // so unitPrice/name are never sent alongside it.
  productId?: string;
  name?: string;
  unitPrice?: number;
  quantity: number;
}

export interface OrderSubmitInput {
  items: OrderSubmitItem[];
  paymentMethodId?: string;
  transactionRef?: string;
  paymentConfirmed?: boolean;
  clientReference: string;
}

export interface OrderSubmitResponseItem {
  productId: string | null;
  name: string;
  unitPrice: number;
  quantity: number;
  subtotal: number;
}

export interface OrderSubmitResponse {
  id: string;
  orderNumber: string;
  terminalId: string;
  storeId: string;
  status: string;
  paymentConfirmed: boolean;
  subtotal: number;
  total: number;
  itemCount: number;
  items: OrderSubmitResponseItem[];
}

/**
 * `POST /terminal-api/order/submit` — confirmed present in zupa-api source
 * (src/modules/terminal/index.js:643, terminalAuth-gated like every other
 * terminal-facing endpoint), but as **uncommitted working-tree changes
 * only** (models, migration, and the route itself are all uncommitted) —
 * same situation as the payment-methods feature. See docs/ARCHITECTURE.md §7.3.
 *
 * Idempotent on `clientReference` (we pass `sale.id`): resubmitting the same
 * reference returns the existing order (200) rather than erroring. Confirmed
 * via source: the uniqueness constraint is **global** on `clientReference`
 * alone, not scoped per terminal — a discrepancy worth flagging to the API
 * team, though harmless here since `sale.id` is a random UUID. A 409 means
 * two concurrent submissions raced at insert time; the documented fix is to
 * retry the same request once the race resolves, which this does internally
 * (a few short retries) rather than surfacing 409 to the caller.
 */
export async function submitOrder(creds: TerminalCredentials, input: OrderSubmitInput): Promise<OrderSubmitResponse> {
  const MAX_ATTEMPTS = 3;
  let lastError: unknown;

  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    let response: Response;
    try {
      response = await fetch(`${zupaConfig.baseUrl}/terminal-api/order/submit`, {
        method: "POST",
        headers: terminalHeaders(creds, true),
        body: JSON.stringify(input),
      });
    } catch (cause) {
      throw new ZupaApiError(`Could not reach Zupa API: ${(cause as Error).message}`);
    }

    if (response.status === 409) {
      lastError = new ZupaApiError("clientReference race on /terminal-api/order/submit — retrying");
      await new Promise((resolve) => setTimeout(resolve, 300 * attempt));
      continue;
    }
    if (!response.ok) {
      await handleTerminalError(response, "/terminal-api/order/submit");
    }
    return response.json() as Promise<OrderSubmitResponse>;
  }

  throw lastError instanceof Error ? lastError : new ZupaApiError("Order submission failed after retries");
}
