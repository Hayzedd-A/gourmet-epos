import type { Product } from "./types/domain";

/**
 * Products are already flat (size baked in via variantDescription — see
 * docs/ARCHITECTURE.md §4.2), so a cart/receipt/sales-table line needs the
 * variant folded into the display label to distinguish "Banana Bread
 * (Mini)" from "Banana Bread (Maxi)". "Standard" is the single-variant
 * default and adds no information, so it's suppressed.
 */
export function productLabel(name: string, variantDescription: string | null): string {
  const variant = variantDescription?.trim();
  if (!variant || variant.toLowerCase() === "standard") {
    return name;
  }
  return `${name} (${variant})`;
}

export function productLabelFor(product: Pick<Product, "name" | "variantDescription">): string {
  return productLabel(product.name, product.variantDescription);
}
