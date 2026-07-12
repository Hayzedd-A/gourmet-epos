"use client";

import { formatNaira } from "../../lib/format";
import type { BaseProduct, CategorySize, Product } from "../../shared/types/domain";

interface SizePickerProps {
  baseProduct: BaseProduct | null;
  variants: Product[];
  categorySizes: CategorySize[];
  onSelect: (variant: Product) => void;
  onClose: () => void;
}

export function SizePicker({ baseProduct, variants, categorySizes, onSelect, onClose }: SizePickerProps) {
  if (!baseProduct) return null;

  const sizeName = (categorySizeId: string | null) =>
    categorySizes.find((s) => s.id === categorySizeId)?.name ?? "Standard";

  return (
    <dialog
      ref={(node) => node?.showModal()}
      onClose={onClose}
      className="w-full max-w-sm rounded-[var(--radius-panel)] border border-border bg-bg p-0 text-ink backdrop:bg-black/40"
    >
      <div className="flex flex-col gap-4 p-6">
        <h2 className="text-lg font-semibold">{baseProduct.name}</h2>
        <div className="flex flex-col gap-2">
          {variants
            .slice()
            .sort((a, b) => a.unitPrice - b.unitPrice)
            .map((variant) => (
              <button
                key={variant.id}
                onClick={() => onSelect(variant)}
                className="flex h-14 items-center justify-between rounded-[var(--radius-control)] border border-border bg-surface px-4 text-left transition-colors hover:bg-surface-hover"
              >
                <span className="text-sm font-medium text-ink">{sizeName(variant.categorySizeId)}</span>
                <span className="font-figures text-sm font-semibold text-ink">
                  {formatNaira(variant.unitPrice)}
                </span>
              </button>
            ))}
        </div>
        <button
          onClick={onClose}
          className="self-center text-sm font-medium text-muted hover:text-ink"
        >
          Cancel
        </button>
      </div>
    </dialog>
  );
}
