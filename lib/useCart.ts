"use client";

import { useMemo, useState } from "react";
import { productLabelFor } from "../shared/productLabel";
import type { Product } from "../shared/types/domain";

export interface CartLine {
  productId: string;
  name: string;
  unitPrice: number;
  quantity: number;
}

export function useCart() {
  const [lines, setLines] = useState<CartLine[]>([]);

  function add(product: Product) {
    setLines((prev) => {
      const existing = prev.find((l) => l.productId === product.id);
      if (existing) {
        return prev.map((l) =>
          l.productId === product.id ? { ...l, quantity: l.quantity + 1 } : l,
        );
      }
      return [...prev, { productId: product.id, name: productLabelFor(product), unitPrice: product.price, quantity: 1 }];
    });
  }

  function setQuantity(productId: string, quantity: number) {
    setLines((prev) =>
      quantity <= 0
        ? prev.filter((l) => l.productId !== productId)
        : prev.map((l) => (l.productId === productId ? { ...l, quantity } : l)),
    );
  }

  function remove(productId: string) {
    setLines((prev) => prev.filter((l) => l.productId !== productId));
  }

  function clear() {
    setLines([]);
  }

  // Replaces the cart wholesale — used to resume a held order. Loaded lines
  // keep their original name/price snapshot (e.g. from a held order's saved
  // items) rather than looking up the live product, same as `add` freezes a
  // snapshot for a newly-added line.
  function load(newLines: CartLine[]) {
    setLines(newLines);
  }

  const subtotal = useMemo(() => lines.reduce((sum, l) => sum + l.unitPrice * l.quantity, 0), [lines]);

  return { lines, add, setQuantity, remove, clear, load, subtotal };
}
