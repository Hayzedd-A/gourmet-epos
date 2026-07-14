"use client";

import { useMemo, useState } from "react";
import { formatNaira } from "../../lib/format";
import { matchesProductSearch } from "../../shared/productSearch";
import { productLabelFor } from "../../shared/productLabel";
import type { Product } from "../../shared/types/domain";

export type SourceTab = "zupa" | "terminal";

// "terminal" covers both csv_import and manual — everything that isn't the
// live Zupa catalog. See docs/ARCHITECTURE.md §4.2.
export function matchesTab(product: Product, tab: SourceTab): boolean {
  return tab === "zupa"
    ? product.source === "zupa_catalog"
    : product.source !== "zupa_catalog";
}

interface ProductGridProps {
  products: Product[];
  sourceTab: SourceTab;
  search: string;
  onSelect: (product: Product) => void;
}

export function ProductGrid({
  products,
  sourceTab,
  search,
  onSelect,
}: ProductGridProps) {
  const [category, setCategory] = useState<string | "all">("all");

  const inTab = useMemo(
    () => products.filter((p) => p.isAvailable && matchesTab(p, sourceTab)),
    [products, sourceTab],
  );

  const categories = useMemo(
    () =>
      [...new Set(inTab.map((p) => p.category))].sort((a, b) =>
        a.localeCompare(b),
      ),
    [inTab],
  );

  const searching = search.trim().length > 0;

  // Search overrides the category pill — it searches the whole tab so
  // switching categories isn't needed just to find something by name.
  const visible = searching
    ? inTab.filter((p) => matchesProductSearch(productLabelFor(p), search))
    : inTab.filter((p) => category === "all" || p.category === category);

  return (
    <div className="flex h-full flex-col gap-3">
      <div className="flex gap-2 [-webkit-scrollbar:none] scrollbar-none overflow-x-auto pb-1">
        <button
          onClick={() => setCategory("all")}
          disabled={searching}
          className={`shrink-0 rounded-full px-4 py-2 text-sm font-medium transition-colors disabled:opacity-40 ${
            category === "all"
              ? "bg-primary text-primary-ink"
              : "bg-surface text-ink hover:bg-surface-hover"
          }`}
        >
          All
        </button>
        {categories.map((c) => (
          <button
            key={c}
            onClick={() => setCategory(c)}
            disabled={searching}
            className={`shrink-0 rounded-full px-4 py-2 text-sm font-medium transition-colors disabled:opacity-40 ${
              category === c
                ? "bg-primary text-primary-ink"
                : "bg-surface text-ink hover:bg-surface-hover"
            }`}
          >
            {c}
          </button>
        ))}
      </div>

      <div className="grid grid-cols-2 [-webkit-scrollbar:none] scrollbar-none gap-3 max-h-[calc(100vh-14rem)] scrollbar-hide overflow-y-auto sm:grid-cols-3 xl:grid-cols-4">
        {visible.map((product) => (
          <button
            key={product.id}
            onClick={() => onSelect(product)}
            className="flex h-28 flex-col justify-between rounded-panel border border-border bg-surface p-4 text-left transition-colors hover:bg-surface-hover active:scale-[0.98]"
          >
            <span className="text-sm font-medium text-ink">
              {productLabelFor(product)}
            </span>
            <span className="font-figures text-base font-semibold text-ink">
              {formatNaira(product.price)}
            </span>
          </button>
        ))}
        {visible.length === 0 && (
          <p className="col-span-full py-12 text-center text-sm text-muted">
            {searching
              ? "No products match your search."
              : "No products in this category."}
          </p>
        )}
      </div>
    </div>
  );
}
