"use client";

import { useEffect, useState } from "react";
import { Cart } from "@/components/pos/Cart";
import { CheckoutModal } from "@/components/pos/CheckoutModal";
import { CloseShiftModal } from "@/components/pos/CloseShiftModal";
import { OpenShiftGate } from "@/components/pos/OpenShiftGate";
import { ProductGrid } from "@/components/pos/ProductGrid";
import { SizePicker } from "@/components/pos/SizePicker";
import { Button } from "@/components/ui/Button";
import { getApi } from "@/lib/ipc/client";
import { useCart } from "@/lib/useCart";
import { useSession } from "@/lib/session";
import type { BaseProduct, Category, CategorySize, PaymentMethod, Product } from "@/shared/types/domain";

export default function PosPage() {
  const { session, refresh } = useSession();
  const cart = useCart();

  const [products, setProducts] = useState<Product[]>([]);
  const [baseProducts, setBaseProducts] = useState<BaseProduct[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [categorySizes, setCategorySizes] = useState<CategorySize[]>([]);
  const [sizePicker, setSizePicker] = useState<{ baseProduct: BaseProduct; variants: Product[] } | null>(null);
  const [checkoutOpen, setCheckoutOpen] = useState(false);
  const [closeShiftOpen, setCloseShiftOpen] = useState(false);
  const [toast, setToast] = useState<string | null>(null);

  useEffect(() => {
    if (!session?.shiftId) return;
    let cancelled = false;
    Promise.all([
      getApi().catalog.listProducts(),
      getApi().catalog.listBaseProducts(),
      getApi().catalog.listCategories(),
      getApi().catalog.listCategorySizes(),
    ]).then(([p, bp, c, cs]) => {
      if (cancelled) return;
      setProducts(p);
      setBaseProducts(bp);
      setCategories(c);
      setCategorySizes(cs);
    });
    return () => {
      cancelled = true;
    };
  }, [session?.shiftId]);

  function handleSelectBaseProduct(baseProduct: BaseProduct, variants: Product[]) {
    if (variants.length === 1) {
      cart.add(variants[0]);
      return;
    }
    setSizePicker({ baseProduct, variants });
  }

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
        onOpen={async (openingFloat) => {
          await getApi().shifts.open(openingFloat);
          await refresh();
        }}
      />
    );
  }

  async function handleConfirmSale(input: {
    paymentMethod: PaymentMethod;
    discountValue: number;
    amountTendered: number | null;
  }) {
    const saleResult = await getApi().sales.create({
      shiftId: session!.shiftId!,
      items: cart.lines.map((l) => ({ productId: l.productId, quantity: l.quantity })),
      discountValue: input.discountValue,
      paymentMethod: input.paymentMethod,
      amountTendered: input.amountTendered,
    });
    getApi().printer.printReceipt(saleResult.id).catch(() => {});
    cart.clear();
    setCheckoutOpen(false);
    setToast("Sale recorded");
  }

  return (
    <div className="flex h-full flex-col">
      <div className="flex justify-end px-4 pt-3">
        <Button variant="secondary" onClick={() => setCloseShiftOpen(true)}>
          End shift
        </Button>
      </div>

      <div className="grid flex-1 grid-cols-[1fr_360px] gap-4 overflow-hidden p-4">
        <ProductGrid
          baseProducts={baseProducts}
          products={products}
          categories={categories}
          onSelect={handleSelectBaseProduct}
        />
        <Cart
          lines={cart.lines}
          subtotal={cart.subtotal}
          onSetQuantity={cart.setQuantity}
          onRemove={cart.remove}
          onCharge={() => setCheckoutOpen(true)}
        />
      </div>

      <SizePicker
        baseProduct={sizePicker?.baseProduct ?? null}
        variants={sizePicker?.variants ?? []}
        categorySizes={categorySizes}
        onSelect={(variant) => {
          cart.add(variant);
          setSizePicker(null);
        }}
        onClose={() => setSizePicker(null)}
      />

      <CheckoutModal
        open={checkoutOpen}
        subtotal={cart.subtotal}
        onClose={() => setCheckoutOpen(false)}
        onConfirm={handleConfirmSale}
      />

      <CloseShiftModal
        open={closeShiftOpen}
        onClose={() => setCloseShiftOpen(false)}
        onConfirm={async (closingTotal) => {
          await getApi().shifts.close(closingTotal);
          await refresh();
          setCloseShiftOpen(false);
        }}
      />

      {toast && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 rounded-full bg-ink px-4 py-2 text-sm text-bg shadow-lg">
          {toast}
        </div>
      )}
    </div>
  );
}
