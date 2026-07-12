"use client";

import { useState } from "react";
import { formatNaira } from "../../lib/format";
import type { BaseProduct, Category, Product } from "../../shared/types/domain";

interface ProductGridProps {
  baseProducts: BaseProduct[];
  products: Product[];
  categories: Category[];
  onSelect: (baseProduct: BaseProduct, variants: Product[]) => void;
}

function priceLabel(variants: Product[]): string {
  const prices = variants.map((v) => v.unitPrice);
  const min = Math.min(...prices);
  const max = Math.max(...prices);
  return min === max ? formatNaira(min) : `${formatNaira(min)}–${formatNaira(max)}`;
}

export function ProductGrid({ baseProducts, products, categories, onSelect }: ProductGridProps) {
  const [categoryId, setCategoryId] = useState<string | "all">("all");

  const variantsByBaseProduct = new Map<string, Product[]>();
  for (const p of products) {
    if (!p.isAvailable) continue;
    const list = variantsByBaseProduct.get(p.baseProductId) ?? [];
    list.push(p);
    variantsByBaseProduct.set(p.baseProductId, list);
  }

  const visible = baseProducts.filter(
    (bp) =>
      (categoryId === "all" || bp.categoryId === categoryId) &&
      (variantsByBaseProduct.get(bp.id)?.length ?? 0) > 0,
  );

  return (
    <div className="flex h-full flex-col gap-4">
      <div className="flex gap-2 overflow-x-auto pb-1">
        <button
          onClick={() => setCategoryId("all")}
          className={`shrink-0 rounded-full px-4 py-2 text-sm font-medium transition-colors ${
            categoryId === "all" ? "bg-primary text-primary-ink" : "bg-surface text-ink hover:bg-surface-hover"
          }`}
        >
          All
        </button>
        {categories.map((c) => (
          <button
            key={c.id}
            onClick={() => setCategoryId(c.id)}
            className={`shrink-0 rounded-full px-4 py-2 text-sm font-medium transition-colors ${
              categoryId === c.id ? "bg-primary text-primary-ink" : "bg-surface text-ink hover:bg-surface-hover"
            }`}
          >
            {c.name}
          </button>
        ))}
      </div>

      <div className="grid grid-cols-2 gap-3 overflow-y-auto sm:grid-cols-3 xl:grid-cols-4">
        {visible.map((bp) => {
          const variants = variantsByBaseProduct.get(bp.id) ?? [];
          return (
            <button
              key={bp.id}
              onClick={() => onSelect(bp, variants)}
              className="flex h-28 flex-col justify-between rounded-[var(--radius-panel)] border border-border bg-surface p-4 text-left transition-colors hover:bg-surface-hover active:scale-[0.98]"
            >
              <span className="text-sm font-medium text-ink">{bp.name}</span>
              <span className="font-figures text-base font-semibold text-ink">{priceLabel(variants)}</span>
            </button>
          );
        })}
        {visible.length === 0 && (
          <p className="col-span-full py-12 text-center text-sm text-muted">
            No products in this category.
          </p>
        )}
      </div>
    </div>
  );
}
