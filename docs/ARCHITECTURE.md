# epos — Architecture

Offline-first point-of-sale for Gourmet Twist, built to scale from one branch to a multi-branch chain. This document is the source of truth for system design decisions; update it when a decision changes rather than letting the code silently diverge from it.

## 1. Goals and constraints

- Staff can open a shift, ring up sales, and close a shift with **zero network dependency**. Recording a sale must never be blocked by connectivity.
- A device can stay offline **indefinitely** — there is no forced re-auth or expiry that halts local operation. Only sync (push sales, pull catalog/staff updates) needs the network, and it degrades gracefully.
- Runs as a **desktop app per terminal** (Electron), with a USB thermal printer per terminal. No cash is accepted (card/transfer only), so there's no cash drawer to manage.
- One brand (Gourmet Twist) today, **multiple branches** soon, each with one or more terminals. Zupa's real tenancy model is `store` → `terminal` directly — there is **no `branch` layer**; an earlier draft of this document speculated one would be added server-side, but the actual Terminal API implementation confirms it never was and isn't needed. Multi-branch, if it happens, means more `terminal` rows under the same store, not a new entity.
- Inventory is **informational only** — never blocks or reserves a sale. This removes the need for distributed stock locking.
- Zupa API (`zupa-api`) is the system of record once a sale syncs. It now has a purpose-built **Terminal API** (`/terminal-api/*`) for exactly this app — device registration/auth and a merged product catalog — built and confirmed live, not aspirational (see §4.2/§7). A POS sales-push endpoint is the one piece still missing.

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
│  └───────────────────────────────┘                │ USB printer                │   │
│                                                     └─────────────┬──────────────┘  │
└───────────────────────────────────────────────────────────────────┼────────────────┘
                                                                     │ HTTPS, opportunistic
                                                                     ▼
                                                        zupa-api (extended, see §7)
                          Terminal API: device registration/auth, product catalog (built, confirmed live)
                                    pos-sale endpoint (new, still missing)
```

**Why a main-process data layer instead of a plain web/PWA app:** Electron gives full Node access in the main process (native SQLite, USB printer I/O) without needing a Rust plugin layer (Tauri). The renderer stays a thin UI layer with no direct network, filesystem, or hardware access — every state-owning operation goes through an IPC bridge, so the renderer can never bypass the outbox and fire an unbuffered network call.

**Next.js runs as a static export, not a server.** Because the renderer's only data path is IPC, none of the sale/product/auth logic needs a Next.js server (route handlers, server actions, SSR) at runtime — that logic already lives in the Electron main process. So `next.config.ts` uses `output: 'export'`: `next build` produces static HTML/CSS/JS in `out/`, which the main process serves from a local static file server in production and Next's own dev server (with HMR) in development. This avoids managing a second Node child process/port inside the packaged app and keeps startup fast and dependency-free.

## 3. Tech stack

| Concern | Choice | Why |
|---|---|---|
| Desktop shell | Electron | Gives native SQLite + USB access from the main process; main process also serves the Next.js static export in production. |
| UI | Next.js App Router (existing scaffold), static export (`output: 'export'`), React 19, Tailwind v4 | Renders as a pure client UI talking to IPC — no server runtime needed since all state lives in the main process. |
| Local DB | SQLite via `better-sqlite3` | Synchronous, embedded, zero external service — correct fit for a main-process data layer that must work with no network. |
| ORM/migrations | Drizzle ORM | Typed schema, lightweight, first-class `better-sqlite3` support, plain SQL migrations that are easy to reason about offline. |
| IPC | `contextBridge` + `ipcRenderer.invoke`, typed wrappers in `lib/ipc/` | Keeps renderer sandboxed (`contextIsolation: true`, no `nodeIntegration`). |
| Printer | USB ESC/POS thermal printer, no cash drawer (no cash accepted) | Matches confirmed hardware setup; no network printer discovery needed since it's wired per terminal. |
| Packaging | `electron-builder` | Standard installer generation for Windows/Linux/macOS targets. |

## 4. Data model

### 4.1 Local SQLite (per terminal — this is the durable, offline source of truth for sales)

| Table | Purpose | Key fields |
|---|---|---|
| `terminal_config` | Singleton row identifying this device | `terminalId` (local synthetic id, shift/sale attribution only), `deviceSecret`, `apiKey`/`storeId` (null until activated — see §6), cached `jwt` (super admin, no refresh token — see §6) |
| `staff_cache` | Local staff/admin PIN roster, plus one row per super admin who's logged in here | `id`, `name`, `pinHash` (nullable — null for super_admin), `accessRole` (`staff`\|`admin`\|`super_admin`), `updatedAt` |
| `product_cache` | One sellable row per `GET /terminal-api/products/:prodType` entry — already flat, size baked in via `variantDescription` | `id` (synthetic: `remoteId ?? zupaProductId`), `name`, `category` (plain string), `description`, `price`, `priceExTax`, `variantDescription`, `source` (`csv_import`\|`zupa_catalog`\|`manual`), `remoteId`, `zupaProductId`, `isAvailable`, `updatedAt` |
| `shift` | Staff clock-in/out per terminal — no cash reconciliation, just a time window (no cash is accepted) | `id`, `staffId`, `terminalId`, `openedAt`, `closedAt` |
| `payment_method_cache` | Synced payment methods assigned to this terminal for the checkout picker (no more fixed `card`\|`transfer` enum — see §8) | `id`, `name`, `type` (informational: `squad_pos`\|`cash`\|`bank_transfer`\|`other`), `isActive`, `updatedAt` |
| `sale` | **Source of truth for a sale — including one not yet finalized** | `id` (UUID, = `clientReference`), `shiftId`, `staffId`, `storeId`, `terminalId`, `status` (`held`\|`discarded`\|`completed`\|`voided` — see §9), `subtotal`, `discountValue`, `taxValue`, `total`, `paymentMethodId`/`paymentMethodLabel` (nullable — null while held, label snapshots the name at sale time like `nameAtSale` below), `transactionRef` (nullable — set once a Squad receipt is claimed, see §8), `matchStatus` (`unmatched`\|`matched`), `matchedAt` (nullable), `openedAt`, `updatedAt`, `label` (nullable — table/customer identifier for a held order), `soldAt` (nullable — null until finalized), `syncStatus` (`pending`\|`synced`\|`failed`), `serverOrderId` (nullable, set once synced) |
| `sale_item` | Line items for a sale | `id`, `saleId`, `productId`, `nameAtSale`, `unitPriceAtSale`, `quantity`, `lineTotal` |
| `outbox` | Queue of sales pending push | `saleId`, `attempts`, `lastAttemptAt`, `lastError` |
| `sync_meta` | Drives pulls | `resource` (`catalog`\|`staff`\|`paymentMethods`), `lastSyncedAt` |

Sales are written to `sale`/`sale_item` and enqueued in `outbox` **atomically and before any network call**. A sale exists and is reportable locally the instant checkout completes, regardless of connectivity.

### 4.2 Zupa's Terminal API — the real, built, confirmed-live integration

This app now talks to a purpose-built Terminal API (`/terminal-api/*` in `zupa-api`, admin UI already shipped in ZupaFE) instead of the general-purpose endpoints assumed in earlier passes. Two separate credential types, described in §6.

- **Device registration happens in ZupaFE, not this app.** An admin registers a terminal (name + store) from ZupaFE's Store Builder → Devices tab, which calls `POST /terminal-api/terminals` and shows the generated `apiKey` **exactly once** (plaintext, `crypto.randomBytes(32).toString("hex")`, no hashing server-side). epos never calls this endpoint — it only ever receives that key, typed in once during activation (§6).
- **Product catalog: `GET /terminal-api/products/:prodType`**, `prodType` one of `terminal` | `zupa` | `all` (unvalidated server-side — anything else silently behaves like `all`). Auth via `X-Terminal-Key: <apiKey>` header; store context is resolved from the key, never passed as a param. This is a real, implemented, confirmed-via-source endpoint — **not** the paramless `GET /terminal-api/products` a stale PDF spec describes; trust the code.
  - `terminal` → rows from the `terminal_products` table (`source: csv_import` — a one-time CSV seed of 207 legacy products — or `manual` — added via ZupaFE's catalog-admin tab).
  - `zupa` → a live query against Zupa's real store catalog, always tagged `source: "zupa_catalog"`.
  - `all` → both, concatenated. **epos always fetches `all`** (see §5) and caches both — the POS UI filters to `terminal` only by default in this version (Zupa/Terminal tab switch hidden, see §5), a client-side filter on `source`, not a second request.
  - Response: `{ storeId, totalProducts, categories: string[], products: [...], grouped: {...} }`. `products` is the flat, de-duplicated list; `grouped` is the *same* rows re-keyed by category — **use one, never both**, or products get double-counted. epos uses `products` and derives its own category groupings client-side.
  - Each product row is already a fully-resolved sellable unit — `{ id, name, category, description, price, priceExTax, variantDescription, source, zupaProductId }`. No separate base-product/category-size entities exist in this API (unlike the customer-requests-based model assumed in an earlier pass) — size is just a display string (`variantDescription`, e.g. "Mini"), and **exactly one of `id`/`zupaProductId` is non-null per row**: `id` (a real `terminal_products.id`) for `csv_import`/`manual` rows, `zupaProductId` (null `id`) for `zupa_catalog` rows. `product_cache.id` is synthesized as `remoteId ?? zupaProductId`.
  - `price` is inc. tax (per ZupaFE's catalog-admin form); `priceExTax` is stored but not surfaced in the UI — no tax logic exists in this app yet (`sale.taxValue` is always `0`).
- **`isAvailable`/`isInventoryLow`/`quantity` don't exist on this response at all** (unlike the older customer-requests model) — every pulled row is written locally with `isAvailable` hardcoded `true`, matching the standing business rule that products are always available. Only *absence* from a pull (see §5) hides a row locally.
- **Catalog writes (create/rename/delete) are not implemented against Zupa from epos.** ZupaFE's catalog-admin tab already does this (`POST`/`PATCH /terminal-api/catalog`) for the terminal-sourced catalog; epos's admin Products screen only edits its **local cache** (price/availability) — see §7.
- `administrator` (`pinCode` + `accessRole`, plaintext, `GET /administrators`) is **not used** for staff/admin accounts — see §6; `POST /auth/login` (`isStore: false`) is the only Zupa auth endpoint epos calls outside the Terminal API, and only for the super_admin role.
- **Known gap in zupa-api, not epos's to fix**: none of the Terminal API's admin endpoints (`terminals` register/list/update/rotate-key, `catalog` add/update) have any auth middleware today — confirmed via source, not documented behavior. Worth flagging to whoever owns that repo.

## 5. Sync engine

**Push (sales → Zupa), outbox pattern:**
1. Checkout completes → row written to `sale`/`sale_item`, row enqueued in `outbox`. This step never touches the network.
2. A background worker in the main process drains the outbox whenever the network is reachable (checked opportunistically + on OS online events), POSTing each sale to the new POS sales endpoint with its `clientReference`.
3. Server dedupes on `{platform: "pos", platformOrderReference: clientReference}` — the same idempotency pattern already used by Zupa's Slack-order integration — so retries and double-sends are safe.
4. Success → `sale.syncStatus = synced`, `serverOrderId` recorded, outbox row removed. Failure → left `pending`, retried with backoff; never blocks new sales.

**Pull (catalog ← Zupa's Terminal API), merge not replace:**
1. No-ops entirely if the terminal isn't activated yet (`terminal_config.apiKey` null) — the scheduler still calls this unconditionally, there's just nothing to do before activation.
2. On app start and periodically while online, fetch `GET /terminal-api/products/all` in one call — both the `terminal` and `zupa` catalogs come back together, tagged by `source`. Always `all`, never per-tab: both are cached locally regardless of what the POS UI currently shows. **This version hides the Zupa/Terminal tab switch and hardcodes the POS grid to `terminal` products only** (`app/(shell)/pos/page.tsx` passes `sourceTab="terminal"` to `ProductGrid` with no UI to change it) — `zupa_catalog`-sourced rows still sync and cache locally, they're just not surfaced. The switch/filter logic itself (`ProductGrid`'s `matchesTab`) is untouched, so re-exposing it for a build that needs both is a UI-only change, not a data-model one.
3. Upsert every returned row with `isAvailable` hardcoded `true` (see §4.2 — no availability signal exists on this response at all).
4. Any product that existed locally before but is **absent from this pull entirely** gets hidden (`isAvailable = false`), not deleted — it stays in the local cache for admin/history visibility, it just won't show in the POS grid.
5. Advance `sync_meta.lastSyncedAt` for the `catalog` resource.
6. No conflict resolution is needed on this side — Zupa is authoritative for catalog data, the local cache is strictly a read replica.
7. Staff pull isn't wired up yet — `sync_meta` has a `staff` row reserved for it, but nothing populates `staff_cache` beyond the local demo seed today. See §6/§7.

**Why no stock reservation/locking:** inventory is informational only (confirmed decision) — nothing on the Terminal API's product response even carries a quantity/stock field anymore, so there's nothing to reserve or lock in the first place.

**Multi-terminal, same branch:** terminals do not sync with each other directly. Each has its own local SQLite DB and pushes/pulls independently against Zupa API, which is the only shared source of truth across terminals (e.g. for cross-terminal reporting in the admin section).

## 6. Auth & roles

**Two independent tracks: device identity and person identity.** They're never conflated — a terminal can be activated with nobody logged in, and someone can log in on a terminal that isn't activated yet (though nothing useful works until it is, see below).

**Device: terminal activation (hard gate before login).** `terminal_config.apiKey`/`storeId` are null until an admin registers this device in ZupaFE (Store Builder → Devices), which returns an `apiKey` shown exactly once. epos's `app/page.tsx` checks `terminal:getStatus()` first, before anything else: if not activated, it renders `ActivationScreen` (paste the API key) instead of any login UI — no PIN login, no super-admin login, nothing, until activation succeeds. There's no dedicated "validate this key" endpoint, so activation just calls `GET /terminal-api/products/all` with the entered key: a 401 means invalid/inactive, success gives back `storeId` (resolved server-side from the key) to store locally. This key is sent as `X-Terminal-Key` on every Terminal API call going forward, and **is not tied to any person's session** — background sync and the manual "Sync now" button work regardless of who's logged in (or if anyone is), same as before.

Three roles, two login paths, for the *person* using an already-activated terminal:

- **staff** — POS only. Logs in with a PIN checked against locally cached `staff_cache.pinHash`. Fully offline-capable. Only ever sees their own sales on the Sales page (`sales:list` filters to `staffId = session.staffId` server-side — see `canViewAllSales` — not just a hidden UI filter, so a staff PIN can't see anyone else's transactions even by calling the IPC channel directly).
- **admin** — everything staff can do, plus full product-cache editing (price/availability/stock), sale voiding, and seeing every staff member's sales (with a staff filter on the Sales page). Also PIN-based, also fully offline-capable. Same login form as staff (`auth:loginPin`); the resulting `accessRole` on the matched row decides what the UI shows.
- **super_admin** — everything admin can do, plus registering/editing/removing local staff and admin PIN accounts (`staff:create`/`update`/`delete`, local-only — see §4.2 for why this doesn't write through to Zupa). The **only** role that authenticates with real Zupa credentials rather than a PIN: `auth:loginSuperAdmin(email, password)` calls `POST /auth/login`. Zupa's response for this login path is `{ jwt, user, accessRole?, storeInfo? }` — confirmed to have **no refresh token**, just an expiring JWT.

`staff_cache.pinHash` is nullable specifically for this: a super admin gets a `staff_cache` row too (upserted on first login, keyed by their Zupa user id) so shift/sale attribution and name lookups work identically for every role, but that row's `pinHash` is null — `auth:loginPin` explicitly filters to rows with a non-null `pinHash`, so a super admin can never be found via PIN lookup, only via their real Zupa login.

**A super admin's `jwt` is unrelated to catalog sync** (that's the terminal `apiKey` above) — today it exists only as proof this person holds a real Zupa admin account, established once at login with no refresh mechanism (an expired `jwt` just means reconnecting from the "Super Admin" tab again; it blocks nothing else). It's the natural credential for a future person-attributed Zupa call if one ever needs one, but nothing currently requires it beyond the login itself. `sync:getState().authenticated` reports whether it's set; `sync:getState().activated` reports the terminal's own `apiKey` status — these are deliberately two separate flags (see `SyncState` in `shared/types/domain.ts`).

**UI is one shell, not separate route trees.** `app/(shell)/layout.tsx` renders a single nav (POS/Products/Sales/Staff/Settings) filtered by `shared/permissions.ts`'s `canManageCatalog`/`canManageStaff` helpers — the same helpers the IPC handlers use server-side, so the nav's visibility and the actual enforcement never drift apart. No logout/login is needed to move between POS and admin work; a super admin or admin just clicks a different nav link.

## 7. zupa-api changes required (tracked separately, different repo)

Most of what this section used to list (branch/terminal entities, device auth, a unified product catalog) is now **built and confirmed live** as the Terminal API (§4.2/§6) — this section is much shorter than it used to be. Remaining gaps, to be scoped and reviewed as their own change in `zupa-api`:

1. **POS sales endpoint** — still doesn't exist anywhere, under `/terminal-api` or otherwise. Needs to accept line items, payment method, discounts, totals, staff/shift attribution, and `clientReference`, deduping on `{platform: "pos", platformOrderReference}` per the existing Slack-integration pattern. Given everything else terminal-facing now lives under `/terminal-api` with `X-Terminal-Key` auth, that's the natural home for this too (e.g. `POST /terminal-api/sales`) rather than reviving the earlier `jwt`-based `/pos/:branchId/sales` idea — but nothing is confirmed, so `electron/zupa/client.ts#pushSale` still targets the old placeholder shape until a real endpoint is confirmed.
2. **Refund/void** on that same (not-yet-existing) sales resource, for the admin section.
3. *(Optional, not currently blocking)* An `updatedAt`-based incremental filter on `GET /terminal-api/products/:prodType`, if a full catalog fetch on every pull ever stops being cheap enough (~660+ products today, confirmed fine).
4. A real create/update/delete endpoint for individual products under `/terminal-api`, if admin catalog management should ever write through from epos instead of staying local-cache-only — today that's ZupaFE's job (its catalog-admin tab already does this for the terminal-sourced catalog).
5. *(Not epos's to fix, flagging only)* The Terminal API's admin endpoints (`terminals` register/list/update/rotate-key, `catalog` add/update, `payment-methods` create/update/assign) have no auth middleware at all today.
6. **Payment methods feature needs to be committed.** All 5 endpoints (`payment-methods` list/create/update, `terminals/:id/payment-methods` assign, `payment-methods/sync`), the `terminal_payment_method`/`terminal_payment_method_assignment` models, and the updated `payment/search` (reading `paymentMethodId`) are confirmed present and working in the local `zupa-api` dev checkout — but only as **uncommitted working-tree changes**, not on any branch, local or remote (verified via `git log --all`/`git status`). This needs to land as a real commit/PR before any other environment (staging, another dev's machine, CI) has it. `electron/zupa/client.ts#fetchPaymentMethods` treats a 404 as "not available" rather than an error and falls back to the locally-seeded defaults in `db/seed.ts`, specifically so epos degrades gracefully if this working tree is reset before it's committed.

## 8. Payments & reconciliation

**Payments never touch this app.** A Squad POS card reader takes the actual payment; Squad webhooks `zupa-api`, which stores the transaction in `order_payment_receipt` with `status: "pending"`. The terminal's only job is to **find** the matching receipt by amount/time and **claim** it — this is a reconciliation step, not payment processing (see non-goals, §12).

**Confirmed via zupa-api source (`src/modules/terminal/index.js`) — the published Terminal API doc has drifted from this in the past, so treat source as ground truth:**
- `POST /terminal-api/payment/search` — body `{ amount, time?, paymentMethodId? }`. If `time` (ISO 8601) is given, searches ±30 minutes around it; if omitted, falls back to a 24h end-of-day sweep.
- `POST /terminal-api/payment/match` — body `{ transactionRef }`. A `409` means "already matched" (safe to treat as success, not a failure) — `electron/zupa/client.ts` surfaces this as `PaymentAlreadyMatchedError` rather than the (fieldless) 409 body.
- Merchant scoping is resolved from **`paymentMethodId`**, not terminal metadata — `metadata.squadMerchantId`-on-terminal (an earlier iteration of this API) is superseded now that each payment method carries its own `merchantId`. epos never reads or stores a `merchantId` itself, only method ids.

**Payment methods are synced from Zupa, not hardcoded.** `paymentMethodCache` replaces the old fixed `card`\|`transfer` enum so new options (Squad readers, bank transfer, etc.) can be added and assigned per terminal centrally in ZupaFE, via `GET/POST /terminal-api/payment-methods`, `PATCH /terminal-api/payment-methods/:id`, and `PUT /terminal-api/terminals/:id/payment-methods` (assign). The terminal itself only calls `GET /terminal-api/payment-methods/sync` (cache locally, merge/hide-not-delete like `pullCatalog`) and, at checkout, records which method was used. **This whole feature is real and working against the local dev backend, but exists only as uncommitted zupa-api working-tree changes** (§7 item 6) — `electron/zupa/client.ts#fetchPaymentMethods` treats a 404 as "not available" (not an error), falling back to the locally-seeded Card/Transfer defaults in `db/seed.ts` so checkout keeps working if that changes.

**Checkout never blocks on matching.** A sale completes the instant the cashier picks a payment method and confirms — recorded locally with `matchStatus: "unmatched"`. Matching happens two ways, both opportunistic:
1. **Right after the sale, if online** — `sales:create` fires a non-awaited (`void`) call to `tryAutoMatchSale`, which searches by amount+time and auto-claims **only when exactly one receipt matches**. Zero or multiple candidates need a person (via `narration`/`paidAt` disambiguation), so they're left as-is.
2. **End-of-day reconciliation** — the Reconciliation page (`app/(shell)/reconciliation/page.tsx`, admin/super_admin only via `canReconcilePayments`) lists every unmatched completed sale. "Reconcile all" runs the same single-candidate auto-match across all of them in one pass; ambiguous sales get a manual "Search receipts" → pick from the candidate list (shown with sender name/amount/time/RRN) → "Match" flow.

**Why single-candidate-only auto-match:** the terminal has no way to know the payer's identity — only `narration` (bank sender name) disambiguates same-amount receipts, and that requires a person. Auto-claiming an ambiguous match risks attaching the wrong receipt to a sale, which is worse than leaving it unmatched for a person to resolve.

## 9. Held orders (stash & dine-in)

**One feature covers both.** A "held" order is just a `sale` row that hasn't been finalized into a completed sale yet — the same mechanism serves two staff-facing scenarios:
- **Quick stash**: a customer has a delay mid-order; staff sets the cart aside (optionally unlabeled) to help the next person, then resumes it later exactly as left.
- **Dine-in**: a table's running tab — opened when they first order, added to as they request more, finalized (paid) only when they're done. `label` (e.g. "Table 4") is how a held order gets identified as a table rather than an anonymous stash; it's just an optional string, not a separate data model.

**Payment is never chosen while held** — only at final checkout, exactly like a direct sale. This is why `sale.paymentMethodId`/`paymentMethodLabel` are nullable: null for the entire time a row is `status: "held"`, set only at `heldOrders:finalize`. Same reasoning for `soldAt` (null until finalized, so a table's eventual date in sales reports reflects when it was actually paid, not when it was first opened) and `discountValue`/`taxValue` (always `0` while held — discounting happens at checkout).

**`openedAt` vs `soldAt` vs `updatedAt`:** `openedAt` is set once, when the row is first created (held or direct) — "opened 12m ago" in the Held Orders list. `updatedAt` bumps on every re-hold (items/label changed). `soldAt` stays null until `status` becomes `"completed"`. For a sale that skips holding entirely (the common direct-checkout case), all three are simply set to the same instant.

**Held orders are per-terminal only**, like everything else in this app's architecture — no cross-terminal visibility or locking. They're never pushed to the outbox (and so never synced to Zupa) until finalized: holding/re-holding an order is a purely local write, which also means a held order survives an app restart with zero extra work, since local SQLite is already the durable source of truth.

**`electron/ipc/handlers/heldOrders.ts`** (`list`/`hold`/`discard`/`finalize`) and **`electron/ipc/handlers/sales.ts`** (`create`, direct/no-hold checkout) both build on shared helpers in `electron/db/sales.ts` — `resolveLineItems` (product lookup/snapshot/validation) and `replaceLineItems` (swap a sale's `sale_item` rows wholesale) — so product validation and item-snapshotting logic only lives in one place:
- `heldOrders:hold` — creates a new held row, or (`existingId` set) replaces an existing held row's items/label in place. Requires ≥1 item and an open shift, same as a direct sale.
- `heldOrders:discard` — abandons a held order (`status: "discarded"`, distinct from `"voided"` — see below). Any logged-in role can discard; unlike `sales:void` this isn't admin-gated, since a held order was never a real transaction.
- `heldOrders:finalize` — turns a held row into a real sale: resolves the *current* item set (it may have changed since first held), picks a payment method, sets `status: "completed"`, `soldAt`, enqueues the outbox entry, and fires the same opportunistic `tryAutoMatchSale` fire-and-forget as `sales:create` (see §8).

**Why `"discarded"` is a separate status from `"voided"`:** `"voided"` means a real completed sale got reversed (admin-only, via `sales:void`) — it always has a `soldAt`. `"discarded"` means a held order was abandoned before ever being finalized — it never had one. Keeping them distinct means `sales:list` (real transaction history — Sales page, Reconciliation) can safely exclude both `"held"` and `"discarded"` and assume every row it returns has a non-null `soldAt`/`paymentMethodId`, with no runtime null-checks needed at every call site.

**UI**: the POS page's cart gets a "Hold" button next to "Charge" (`components/pos/HoldOrderModal.tsx` prompts for an optional label) and a "Held Orders" button in the page header showing a live count (`components/pos/HeldOrdersModal.tsx` lists them, oldest-opened first, with Resume/Discard). Resuming loads the held order's saved item snapshots directly into the cart (`useCart().load`, preserving original prices even if a product's price has since changed) and tracks `activeHeldOrderId` so checkout routes to `heldOrders:finalize` instead of `sales:create`. If the cart already has unsaved items when resuming a different order, they're auto-held first (reusing the same Hold mechanism) rather than silently discarded.

## 9a. Sales visibility, filters & grouping

**Staff only ever see their own sales; admin/super_admin see everyone's.** Enforced in `sales:list` itself (`shared/permissions.ts#canViewAllSales`), not just hidden in the UI: a staff session's `staffId` param (if it even sends one) is ignored and always overridden to their own `session.staffId`; only admin/super_admin can pass a `staffId` to filter to a specific person. This mirrors the same "helper used by both the IPC handler and the nav" pattern as `canManageCatalog`/`canManageStaff`.

**Sales page filters**: date range (`from`/`to`, day-granularity date inputs converted to start/end-of-day timestamps) and, for admin/super_admin only, a staff dropdown. Both compose with the existing `sales:list` query — no separate endpoint per filter.

**Two view modes, same data**: "All sales" is the flat list (as before); "Group by shift" buckets the same filtered results client-side by `shiftId` (no new `shifts:list` endpoint — the group header is derived entirely from that shift's own sales: staff name, sale count, total of completed sales, and the earliest/latest `soldAt` in the group) so a staff member's whole shift is easy to review as one block, most-recent shift first.

**Clicking a row** opens `components/sales/SaleDetailModal.tsx` — the sale's line items, subtotal/discount/total, status (+ void reason if voided), and payment info: method label always, plus `transactionRef`/`matchedAt` when `matchStatus: "matched"` (nothing to show for an unmatched sale beyond the "Unmatched" badge already on the row).

## 10. Hardware

USB-attached ESC/POS thermal printer per terminal. No cash drawer — no cash is accepted (card/transfer only), so there's nothing to store in a till and nothing to kick open. Driven from the Electron main process — the renderer only ever calls `printReceipt(sale)` over IPC and has no direct device access. No network printer discovery is needed since each printer is wired to its own terminal.

## 10a. Native menu & theme

`electron/menu.ts` builds a real application menu (File/Edit/View/Window; macOS also gets an app menu) via `Menu.setApplicationMenu` — Electron's bare default menu is otherwise all you get. The View menu's theme switcher (Light/Dark radio items) is the only way to change theme; there is no in-app UI control for it.

Theme is **not** driven by the OS's `prefers-color-scheme` — it's an explicit choice, persisted in `terminal_config.theme` (default `light`), applied via `:root[data-theme="dark"]` in `app/globals.css`. Flow: menu click → `electron/menu.ts` persists the choice and rebuilds the menu (so the radio state stays correct) → `webContents.send("theme:changed", theme)` updates the live window. On load, `electron/preload.ts` reads the persisted theme synchronously (`ipcRenderer.sendSync("theme:getSync")`, backed by a synchronous `ipcMain.on` handler registered in `main.ts`) and stamps `data-theme` on `<html>` before the page's own scripts run — no flash of the wrong theme, no renderer-side theme code needed at all.

## 11. Repo layout

```
electron/
  main.ts, preload.ts, menu.ts
  db/           Drizzle schema, migrations, sales.ts (resolveLineItems/replaceLineItems/
                 assembleSale — shared by sales.ts and heldOrders.ts, see §9)
  sync/         pull.ts, push.ts, outbox worker
  hardware/     printer.ts, receipt.ts
  zupa/         client.ts (zupaFetch = jwt auth, terminalFetch = X-Terminal-Key auth;
                 payment search/match/options fetchers — see §8)
  ipc/handlers/ terminal.ts (activation), auth.ts, catalog.ts, sales.ts (direct checkout),
                 heldOrders.ts (list/hold/discard/finalize — see §9), staff.ts, shifts.ts,
                 sync.ts, printer.ts, payments.ts (search/match/reconcileAll, tryAutoMatchSale)
app/
  page.tsx        activation gate → login (PIN tab + Super Admin email/password tab)
  (shell)/        one layout, nav filtered per role — no separate route trees
                  "End shift" lives in the shell header (shown whenever session.shiftId
                  is set, any page), not the POS page — ending it navigates back to /pos
    pos/          order entry (all roles); search bar + Held Orders button live in the
                  page header, ProductGrid keeps only its category pills + the grid —
                  see §9 for the Hold/Resume/Discard flow. Zupa/Terminal tab switch is
                  hidden in this version (hardcoded to terminal products), see §5
    products/     catalog price/availability edits (admin, super_admin)
    sales/        sales history — own sales only for staff, all for admin/super_admin (see
                  §9a); void (admin, super_admin); completed/voided only, held/discarded
                  orders live in the POS page's Held Orders panel; date/staff filters,
                  all-sales vs group-by-shift view, click a row for SaleDetailModal
    reconciliation/ unmatched-sale receipt matching, manual + bulk (admin, super_admin) — see §8
    staff/        local staff/admin PIN roster (super_admin only)
    settings/     terminal activation + sync status + manual trigger (all roles)
lib/ipc/        typed wrappers around window.api.*
lib/useCart.ts  local cart state; `load()` replaces it wholesale to resume a held order
shared/types/   types shared between main & renderer (Sale, Product, TerminalStatus, ...)
shared/permissions.ts  canManageCatalog/canManageStaff/canReconcilePayments/canViewAllSales —
                       used by both IPC handlers and nav/UI gating
shared/productLabel.ts  name + variantDescription → display label (e.g. "Banana Bread (Mini)")
shared/productSearch.ts  word-initial subsequence match — "ba in ba co" finds "Baileys Infused
                         Banana x Coconut Bread"; searches the full display label, overrides
                         the category pill filter while active (searches the whole tab)
```

## 12. Explicit non-goals (v1)

- No in-app payment processing (Paystack/Squad/etc.) — payments are taken by a separate Squad card reader and recorded as already-settled; epos only searches/claims the resulting receipt for reconciliation (see §8), it never initiates or processes a charge.
- No inventory reservation, stock locking, or oversell prevention — stock is informational.
- No cross-terminal real-time sync within a branch — Zupa API is the only shared source of truth across terminals.
- No network/shared printers — one USB printer per terminal.
