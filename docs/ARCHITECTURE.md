# epos — Architecture

Offline-first point-of-sale for Gourmet Twist, built to scale from one branch to a multi-branch chain. This document is the source of truth for system design decisions; update it when a decision changes rather than letting the code silently diverge from it.

## 1. Goals and constraints

- Staff can open a shift, ring up sales, and close a shift with **zero network dependency**. Recording a sale must never be blocked by connectivity.
- A device can stay offline **indefinitely** — there is no forced re-auth or expiry that halts local operation. Only sync (push sales, pull catalog/staff updates) needs the network, and it degrades gracefully.
- Runs as a **desktop app per terminal** (Electron), with USB thermal printer + cash drawer per terminal.
- One brand (Gourmet Twist) today, **multiple branches** soon, each with one or more terminals. Architecture must not hardcode a single-store assumption.
- Inventory is **informational only** — never blocks or reserves a sale. This removes the need for distributed stock locking.
- Zupa API (`zupa-api`) is the system of record once a sale syncs. It currently models tenancy as a single `store`; branches, terminals, and a POS sales channel do not exist yet and must be added there (tracked separately, see §7).

## 2. System shape

```
┌─────────────────────────── Electron app (per terminal) ───────────────────────────┐
│  Renderer (Next.js App Router)                        Main process (Node)         │
│  ┌───────────────────────────────┐   IPC only    ┌────────────────────────────┐   │
│  │ app/(shell)/... one shell,    │◄─────────────►│ SQLite (better-sqlite3 +   │   │
│  │ nav shows/hides per role      │ contextBridge  │  Drizzle ORM) — source of  │   │
│  │ (staff/admin/super_admin)     │                │  truth for THIS terminal   │   │
│  │ no direct network/DB/hardware │                │ Sync engine (outbox +      │   │
│  │ access                        │                │  incremental pull)         │   │
│  └───────────────────────────────┘                │ USB printer / cash drawer  │   │
│                                                     └─────────────┬──────────────┘  │
└───────────────────────────────────────────────────────────────────┼────────────────┘
                                                                     │ HTTPS, opportunistic
                                                                     ▼
                                                        zupa-api (extended, see §7)
                                    branch, terminal, pos-sale endpoints (new)
                                    product, administrator endpoints (existing, reused)
```

**Why a main-process data layer instead of a plain web/PWA app:** Electron gives full Node access in the main process (native SQLite, USB printer/cash-drawer I/O) without needing a Rust plugin layer (Tauri). The renderer stays a thin UI layer with no direct network, filesystem, or hardware access — every state-owning operation goes through an IPC bridge, so the renderer can never bypass the outbox and fire an unbuffered network call.

**Next.js runs as a static export, not a server.** Because the renderer's only data path is IPC, none of the sale/product/auth logic needs a Next.js server (route handlers, server actions, SSR) at runtime — that logic already lives in the Electron main process. So `next.config.ts` uses `output: 'export'`: `next build` produces static HTML/CSS/JS in `out/`, which the main process serves from a local static file server in production and Next's own dev server (with HMR) in development. This avoids managing a second Node child process/port inside the packaged app and keeps startup fast and dependency-free.

## 3. Tech stack

| Concern | Choice | Why |
|---|---|---|
| Desktop shell | Electron | Gives native SQLite + USB access from the main process; main process also serves the Next.js static export in production. |
| UI | Next.js App Router (existing scaffold), static export (`output: 'export'`), React 19, Tailwind v4 | Renders as a pure client UI talking to IPC — no server runtime needed since all state lives in the main process. |
| Local DB | SQLite via `better-sqlite3` | Synchronous, embedded, zero external service — correct fit for a main-process data layer that must work with no network. |
| ORM/migrations | Drizzle ORM | Typed schema, lightweight, first-class `better-sqlite3` support, plain SQL migrations that are easy to reason about offline. |
| IPC | `contextBridge` + `ipcRenderer.invoke`, typed wrappers in `lib/ipc/` | Keeps renderer sandboxed (`contextIsolation: true`, no `nodeIntegration`). |
| Printer/cash drawer | USB ESC/POS thermal printer, cash drawer kicked via printer's RJ11 port | Matches confirmed hardware setup; no network printer discovery needed since it's wired per terminal. |
| Packaging | `electron-builder` | Standard installer generation for Windows/Linux/macOS targets. |

## 4. Data model

### 4.1 Local SQLite (per terminal — this is the durable, offline source of truth for sales)

| Table | Purpose | Key fields |
|---|---|---|
| `terminal_config` | Singleton row identifying this device | `branchId`, `terminalId`, `deviceSecret`, cached `jwt` (no refresh token — see §6) |
| `staff_cache` | Local staff/admin PIN roster, plus one row per super admin who's logged in here | `id`, `name`, `pinHash` (nullable — null for super_admin), `accessRole` (`staff`\|`admin`\|`super_admin`), `updatedAt` |
| `category_cache` | Mirror of Zupa `product_category` — a display grouping (e.g. "Bread"), not itself sellable | `id`, `name`, `position`, `active`, `updatedAt` |
| `category_size_cache` | Mirror of Zupa `product_category_size` — sizes offered within a category (e.g. Mini/Regular/Maxi) | `id`, `name`, `position`, `categoryId`, `updatedAt` |
| `base_product_cache` | Mirror of Zupa `base_product` — what staff tap in the POS grid (e.g. "Cinnamon Swirl Bread") | `id`, `name`, `description`, `categoryId`, `updatedAt` |
| `product_cache` | Mirror of Zupa `product` — one sellable **size variant** of a base product, each its own price | `id`, `name`, `unitPrice`, `baseProductId`, `categorySizeId`, `imageUrl`, `isAvailable`, `quantity` (informational), `updatedAt` |
| `shift` | Staff clock-in/out per terminal | `id`, `staffId`, `terminalId`, `openedAt`, `closedAt`, `openingFloat`, `closingTotal` |
| `sale` | **Source of truth for a completed sale** | `id` (UUID, = `clientReference`), `shiftId`, `staffId`, `branchId`, `terminalId`, `status` (`draft`\|`completed`\|`voided`), `subtotal`, `discountValue`, `taxValue`, `total`, `paymentMethod` (`cash`\|`card`\|`transfer`), `amountTendered`, `soldAt`, `syncStatus` (`pending`\|`synced`\|`failed`), `serverOrderId` (nullable, set once synced) |
| `sale_item` | Line items for a sale | `id`, `saleId`, `productId`, `nameAtSale`, `unitPriceAtSale`, `quantity`, `lineTotal` |
| `outbox` | Queue of sales pending push | `saleId`, `attempts`, `lastAttemptAt`, `lastError` |
| `sync_meta` | Drives pulls | `resource` (`catalog`\|`staff`), `lastSyncedAt` |

Sales are written to `sale`/`sale_item` and enqueued in `outbox` **atomically and before any network call**. A sale exists and is reportable locally the instant checkout completes, regardless of connectivity.

### 4.2 Zupa API — existing entities reused as-is

- `store` — Gourmet Twist remains a single store row; branches nest under it (see §4.3).
- **Product catalog is a hierarchy, not a flat list** — confirmed from a live response, not just source reading: `product_category` (e.g. "Bread") → `product_category_size` (e.g. Mini/Regular/Maxi, per category) and `base_product` (e.g. "Cinnamon Swirl Bread") → `product` (one sellable **size variant** per base product, each its own `unitPrice`). Staff tap a base product in the POS grid, then pick a size — that's what determines the actual price and the `productId` on the sale. Pulled via `GET /search?resource=base_product&$include=category,products,category.sizes,products.categorySize` (a custom `$search` handler, not the plain Feathers `products` CRUD service assumed in an earlier pass). No incremental filter is used — that endpoint's support for `updatedAt` filtering is unconfirmed, so the client does a full catalog replace each pull; cheap enough at single-brand scale.
- **Catalog writes (create/rename/delete) are not implemented against Zupa.** The `POST/PATCH/DELETE /products` endpoints assumed earlier were the wrong shape once the real hierarchy above was confirmed. Until a real write endpoint for creating a base-product+variant combo is confirmed, the admin Products screen only edits its **local cache** (price/availability/stock) — real catalog changes still happen in Zupa's own admin tool. See §7.
- `administrator` — `pinCode` + `accessRole` exist server-side (`GET /administrators`, store-scoped, returns `pinCode` **in plaintext** — Zupa stores/verifies PINs unhashed today, a raw-SQL equality check, with a live SQL-injection hole in `GET /auth/product-department-by-pin-code` as a side finding) but **this app deliberately does not use it for staff/admin accounts** — see §6. Registering staff/admin PIN accounts from epos is local-only by design, so they only ever exist in this terminal's `staff_cache`, not as Zupa `administrator` rows. `POST /auth/login` (with `isStore: false`) is the only Zupa auth endpoint this app calls, and only for the super_admin role.

### 4.3 Zupa API — new entities required

- `branch` — FK `storeId`. Represents a physical Gourmet Twist location.
- `terminal` — FK `branchId`. Provisioned once per device by an admin; holds a device secret used to authenticate sync calls.
- POS sale record — either a new model or the existing `order` model tagged `channel: "pos"` with `branchId`/`terminalId`, `platform: "pos"`, `platformOrderReference` = the local `clientReference` UUID for idempotent upload (see §7).

## 5. Sync engine

**Push (sales → Zupa), outbox pattern:**
1. Checkout completes → row written to `sale`/`sale_item`, row enqueued in `outbox`. This step never touches the network.
2. A background worker in the main process drains the outbox whenever the network is reachable (checked opportunistically + on OS online events), POSTing each sale to the new POS sales endpoint with its `clientReference`.
3. Server dedupes on `{platform: "pos", platformOrderReference: clientReference}` — the same idempotency pattern already used by Zupa's Slack-order integration — so retries and double-sends are safe.
4. Success → `sale.syncStatus = synced`, `serverOrderId` recorded, outbox row removed. Failure → left `pending`, retried with backoff; never blocks new sales.

**Pull (catalog ← Zupa), merge not replace:**
1. On app start and periodically while online, fetch the whole catalog (categories, sizes, base products, variants) in one nested response.
2. Upsert every returned row, trusting its `isAvailable` as current truth — availability changes constantly (sold out, back in stock), so a variant coming back `isAvailable: false` is expected and correctly hides it from the POS grid, not a bug.
3. Any variant that existed locally before but is **absent from this pull entirely** gets hidden (`isAvailable = false`), not deleted — it stays in the local cache for admin/history visibility, it just won't show in the POS grid. This is the distinction that matters: "returned as unavailable" and "not returned at all" are both hidden from POS, but only the latter is inferred rather than told to us directly.
4. Advance `sync_meta.lastSyncedAt` for the `catalog` resource.
5. No conflict resolution is needed on this side — Zupa is authoritative for catalog data, the local cache is strictly a read replica.
6. Staff pull isn't wired up yet — `sync_meta` has a `staff` row reserved for it, but nothing populates `staff_cache` beyond the local demo seed today. See §6/§7.

**Why no stock reservation/locking:** inventory is informational only (confirmed decision) — two terminals can independently sell the "last" unit of something while offline and nothing breaks; the pulled `quantity` is just overwritten by whatever Zupa reports next. This is the main simplification that keeps the sync engine free of distributed-locking concerns.

**Multi-terminal, same branch:** terminals do not sync with each other directly. Each has its own local SQLite DB and pushes/pulls independently against Zupa API, which is the only shared source of truth across terminals (e.g. for cross-terminal reporting in the admin section).

## 6. Auth & roles

Three roles, two login paths:

- **staff** — POS only. Logs in with a PIN checked against locally cached `staff_cache.pinHash`. Fully offline-capable.
- **admin** — everything staff can do, plus full product-cache editing (price/availability/stock) and sale voiding. Also PIN-based, also fully offline-capable. Same login form as staff (`auth:loginPin`); the resulting `accessRole` on the matched row decides what the UI shows.
- **super_admin** — everything admin can do, plus registering/editing/removing local staff and admin PIN accounts (`staff:create`/`update`/`delete`, local-only — see §4.2 for why this doesn't write through to Zupa). The **only** role that authenticates with real Zupa credentials rather than a PIN: `auth:loginSuperAdmin(email, password)` calls `POST /auth/login`. Zupa's response for this login path is `{ jwt, user, accessRole?, storeInfo? }` — confirmed to have **no refresh token**, just an expiring JWT.

`staff_cache.pinHash` is nullable specifically for this: a super admin gets a `staff_cache` row too (upserted on first login, keyed by their Zupa user id) so shift/sale attribution and name lookups work identically for every role, but that row's `pinHash` is null — `auth:loginPin` explicitly filters to rows with a non-null `pinHash`, so a super admin can never be found via PIN lookup, only via their real Zupa login.

**The terminal's Zupa sync credential is not tied to who's logged in.** A super admin's login sets `terminal_config.jwt` as a side effect, but that's incidental — background sync (`startSyncScheduler`) runs on a timer regardless of the current session, and `sync:triggerNow` has no role gate at all: staff can trigger a manual sync same as anyone. Token expiry never blocks local work either way — since there's no refresh token, an expired JWT just pauses sync (surfaced via `sync:getState().authenticated`) until any super admin logs in again from the login screen's "Super Admin" tab.

**UI is one shell, not separate route trees.** `app/(shell)/layout.tsx` renders a single nav (POS/Products/Sales/Staff/Settings) filtered by `shared/permissions.ts`'s `canManageCatalog`/`canManageStaff` helpers — the same helpers the IPC handlers use server-side, so the nav's visibility and the actual enforcement never drift apart. No logout/login is needed to move between POS and admin work; a super admin or admin just clicks a different nav link.

## 7. zupa-api changes required (tracked separately, different repo)

This app cannot be built against zupa-api as it stands today. Required work, to be scoped and reviewed as its own change in `zupa-api`:

1. `branch` model, FK `store`.
2. `terminal` model, FK `branch`, with device-secret issuance for terminal provisioning.
3. POS sales endpoint (e.g. `POST /pos/:branchId/sales`) accepting line items, payment method, discounts, totals, staff/shift attribution, and `clientReference`; dedupes on `{platform: "pos", platformOrderReference}` per the existing Slack-integration pattern.
4. Refund/void on that same sales resource, for the admin section.
5. *(Optional, not currently blocking)* `updatedAt`-based filtering on the `$search?resource=base_product` endpoint, if a full catalog replace on every pull ever stops being cheap enough.
6. A real create/update/delete endpoint for the base-product + size-variant hierarchy, if admin catalog management should ever write through from this app instead of staying local-cache-only (see §4.2).

## 8. Hardware

USB-attached ESC/POS thermal printer per terminal; cash drawer wired through the printer's kick port (standard RJ11 cash-drawer cabling, no separate driver). Both driven from the Electron main process — the renderer only ever calls `printReceipt(sale)` over IPC and has no direct device access. No network printer discovery is needed since each printer is wired to its own terminal.

## 9. Repo layout

```
electron/
  main.ts, preload.ts
  db/           Drizzle schema, migrations
  sync/         pull.ts, push.ts, outbox worker
  hardware/     printer.ts, cashDrawer.ts
app/
  page.tsx        login (PIN tab + Super Admin email/password tab)
  (shell)/        one layout, nav filtered per role — no separate route trees
    pos/          order entry (all roles)
    products/     catalog price/availability/stock edits (admin, super_admin)
    sales/        sales history + void (admin, super_admin)
    staff/        local staff/admin PIN roster (super_admin only)
    settings/     sync status + manual trigger (all roles)
lib/ipc/        typed wrappers around window.api.*
shared/types/   types shared between main & renderer (Sale, Product, Branch, ...)
shared/permissions.ts  canManageCatalog/canManageStaff — used by both IPC handlers and nav gating
```

## 10. Explicit non-goals (v1)

- No in-app payment processing (Paystack/Nomba/etc.) — card and transfer are recorded as already-settled, not charged through the app.
- No inventory reservation, stock locking, or oversell prevention — stock is informational.
- No cross-terminal real-time sync within a branch — Zupa API is the only shared source of truth across terminals.
- No network/shared printers — one USB printer per terminal.
