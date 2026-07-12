import { zupaConfig } from "./config";
import type { Sale } from "../../shared/types/domain";

export class ZupaApiError extends Error {}

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

export interface ZupaCategorySize {
  id: string;
  name: string;
  position: number;
  categoryId: string;
}

export interface ZupaCategory {
  id: string;
  name: string;
  position: string | number;
  active: boolean;
  sizes: ZupaCategorySize[];
}

export interface ZupaProductVariant {
  id: string;
  name: string;
  unitPrice: number;
  isDeleted: boolean;
  isAvailable: boolean;
  imageUrl: string | null;
  quantity: number;
  baseProductId: string;
  categorySizeId: string | null;
  updatedAt: string;
}

export interface ZupaBaseProduct {
  id: string;
  name: string;
  description: string | null;
  isDeleted: boolean;
  categoryId: string | null;
  updatedAt: string;
  category: ZupaCategory | null;
  products: ZupaProductVariant[];
}

/**
 * The real product listing endpoint — confirmed by inspecting a live
 * response, NOT the plain `/products` CRUD service assumed earlier (that
 * assumption was wrong: products here are size variants nested under a
 * base product, not flat rows). No incremental filter is used since this
 * custom `$search` handler's support for `updatedAt` filtering is
 * unconfirmed; a full catalog pull is cheap enough at single-brand scale.
 * See docs/ARCHITECTURE.md §4.2/§7.
 */
export function fetchCatalog(jwt: string | null) {
  const query = new URLSearchParams({
    resource: "base_product",
    $q: "",
    $searchFields: "name",
    $include: "category,products,category.sizes,products.categorySize",
    $order: "-createdAt",
    $limit: "1000",
  });
  return zupaFetch<{ data: ZupaBaseProduct[] }>(`/search?${query}`, jwt).then((r) => r.data);
}

/**
 * Product catalog CRUD (create/rename/delete) is NOT implemented against
 * Zupa — the `/products` POST/PATCH/DELETE endpoints assumed in an earlier
 * pass turned out to be the wrong shape once the real base-product/size-
 * variant hierarchy was confirmed via a live response. Writing a new
 * base_product + variant combo (or deleting one) needs its own confirmed
 * endpoint before this can be built safely; until then catalog changes
 * happen in Zupa's own admin tool, and this app only edits its local cache
 * (price/availability/stock display) via updateProductLocal. See
 * docs/ARCHITECTURE.md §7.
 */

/**
 * NOT YET IMPLEMENTED server-side — tracked in docs/ARCHITECTURE.md §7.3.
 * Dedupe on `{ platform: "pos", platformOrderReference: sale.id }`, mirroring
 * the existing Slack-order idempotency pattern, once this endpoint exists.
 */
export function pushSale(jwt: string | null, branchId: string, saleData: Sale) {
  return zupaFetch<{ id: string }>(`/pos/${branchId}/sales`, jwt, {
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
      paymentMethod: saleData.paymentMethod,
      amountTendered: saleData.amountTendered,
      soldAt: new Date(saleData.soldAt).toISOString(),
    }),
  });
}
