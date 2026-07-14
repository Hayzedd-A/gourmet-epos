"use client";

import { useEffect, useState } from "react";
import { Cart } from "@/components/pos/Cart";
import { CheckoutModal } from "@/components/pos/CheckoutModal";
import { HeldOrdersModal } from "@/components/pos/HeldOrdersModal";
import { HoldOrderModal } from "@/components/pos/HoldOrderModal";
import { OpenShiftGate } from "@/components/pos/OpenShiftGate";
import { ProductGrid } from "@/components/pos/ProductGrid";
import { getApi } from "@/lib/ipc/client";
import { useCart } from "@/lib/useCart";
import { useSession } from "@/lib/session";
import type { Product, Sale } from "@/shared/types/domain";

export default function PosPage() {
  const { session, refresh } = useSession();
  const cart = useCart();

  const [products, setProducts] = useState<Product[]>([]);
  const [search, setSearch] = useState("");
  const [checkoutOpen, setCheckoutOpen] = useState(false);
  const [toast, setToast] = useState<string | null>(null);

  const [heldOrders, setHeldOrders] = useState<Sale[]>([]);
  const [heldOrdersOpen, setHeldOrdersOpen] = useState(false);
  const [holdModalOpen, setHoldModalOpen] = useState(false);
  const [activeHeldOrderId, setActiveHeldOrderId] = useState<string | null>(null);
  const [activeHeldOrderLabel, setActiveHeldOrderLabel] = useState<string | null>(null);

  useEffect(() => {
    if (!session?.shiftId) return;
    let cancelled = false;
    getApi()
      .catalog.listProducts()
      .then((p) => {
        if (!cancelled) setProducts(p);
      });
    return () => {
      cancelled = true;
    };
  }, [session?.shiftId]);

  async function loadHeldOrders() {
    setHeldOrders(await getApi().heldOrders.list());
  }

  useEffect(() => {
    if (!session?.shiftId) return;
    let cancelled = false;
    getApi()
      .heldOrders.list()
      .then((orders) => {
        if (!cancelled) setHeldOrders(orders);
      });
    return () => {
      cancelled = true;
    };
  }, [session?.shiftId]);

  useEffect(() => {
    if (!toast) return;
    const id = setTimeout(() => setToast(null), 3000);
    return () => clearTimeout(id);
  }, [toast]);

  if (!session) {
    return null;
  }

  if (!session.shiftId) {
    return (
      <OpenShiftGate
        onOpen={async () => {
          await getApi().shifts.open();
          await refresh();
        }}
      />
    );
  }

  async function handleConfirmSale(input: { paymentMethodId: string; discountValue: number }) {
    const items = cart.lines.map((l) => ({ productId: l.productId, quantity: l.quantity }));
    const saleResult = activeHeldOrderId
      ? await getApi().heldOrders.finalize(activeHeldOrderId, {
          items,
          discountValue: input.discountValue,
          paymentMethodId: input.paymentMethodId,
        })
      : await getApi().sales.create({
          shiftId: session!.shiftId!,
          items,
          discountValue: input.discountValue,
          paymentMethodId: input.paymentMethodId,
        });
    getApi().printer.printReceipt(saleResult.id).catch(() => {});
    cart.clear();
    setActiveHeldOrderId(null);
    setActiveHeldOrderLabel(null);
    setCheckoutOpen(false);
    setToast("Sale recorded");
    void loadHeldOrders();
  }

  async function handleHold(label: string | null) {
    await getApi().heldOrders.hold({
      shiftId: session!.shiftId!,
      items: cart.lines.map((l) => ({ productId: l.productId, quantity: l.quantity })),
      label,
      existingId: activeHeldOrderId ?? undefined,
    });
    cart.clear();
    setActiveHeldOrderId(null);
    setActiveHeldOrderLabel(null);
    setHoldModalOpen(false);
    setToast("Order held");
    void loadHeldOrders();
  }

  async function handleResume(order: Sale) {
    // Don't lose whatever's currently in the cart — save it aside first
    // (updating it in place if it's itself a resumed held order).
    if (cart.lines.length > 0) {
      await getApi().heldOrders.hold({
        shiftId: session!.shiftId!,
        items: cart.lines.map((l) => ({ productId: l.productId, quantity: l.quantity })),
        label: activeHeldOrderLabel,
        existingId: activeHeldOrderId ?? undefined,
      });
    }
    cart.load(
      order.items.map((i) => ({
        productId: i.productId,
        name: i.nameAtSale,
        unitPrice: i.unitPriceAtSale,
        quantity: i.quantity,
      })),
    );
    setActiveHeldOrderId(order.id);
    setActiveHeldOrderLabel(order.label);
    setHeldOrdersOpen(false);
    void loadHeldOrders();
  }

  async function handleDiscard(order: Sale) {
    await getApi().heldOrders.discard(order.id);
    if (activeHeldOrderId === order.id) {
      cart.clear();
      setActiveHeldOrderId(null);
      setActiveHeldOrderLabel(null);
    }
    void loadHeldOrders();
  }

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center gap-3 border-b border-border px-4 py-3">
        <div className="relative max-w-sm flex-1">
          <input
            type="search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search products…"
            className="h-10 w-full rounded-full border border-border bg-surface px-4 text-sm text-ink focus-visible:outline focus-visible:outline-2 focus-visible:outline-primary"
          />
        </div>

        <button
          onClick={() => setHeldOrdersOpen(true)}
          className="shrink-0 rounded-full border border-border bg-surface px-4 py-2 text-sm font-medium text-ink hover:bg-surface-hover"
        >
          Held Orders{heldOrders.length > 0 ? ` (${heldOrders.length})` : ""}
        </button>
      </div>

      <div className="grid flex-1 grid-cols-[minmax(0,1fr)_360px] gap-4 overflow-hidden p-4">
        {/* Zupa/Terminal tab switch is hidden for this version — always
            terminal products. See docs/ARCHITECTURE.md §5. */}
        <ProductGrid products={products} sourceTab="terminal" search={search} onSelect={cart.add} />
        <Cart
          lines={cart.lines}
          subtotal={cart.subtotal}
          heldOrderLabel={activeHeldOrderId ? activeHeldOrderLabel ?? "Held order" : null}
          onSetQuantity={cart.setQuantity}
          onRemove={cart.remove}
          onCharge={() => setCheckoutOpen(true)}
          onHold={() => setHoldModalOpen(true)}
        />
      </div>

      <CheckoutModal
        open={checkoutOpen}
        subtotal={cart.subtotal}
        onClose={() => setCheckoutOpen(false)}
        onConfirm={handleConfirmSale}
      />

      <HoldOrderModal
        open={holdModalOpen}
        initialLabel={activeHeldOrderLabel}
        onClose={() => setHoldModalOpen(false)}
        onConfirm={handleHold}
      />

      <HeldOrdersModal
        open={heldOrdersOpen}
        orders={heldOrders}
        onClose={() => setHeldOrdersOpen(false)}
        onResume={handleResume}
        onDiscard={handleDiscard}
      />

      {toast && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 rounded-full bg-ink px-4 py-2 text-sm text-bg shadow-lg">
          {toast}
        </div>
      )}
    </div>
  );
}
