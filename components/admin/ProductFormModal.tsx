"use client";

import { useState } from "react";
import { Button } from "../ui/Button";
import { productLabelFor } from "../../shared/productLabel";
import type { Product, ProductInput } from "../../shared/types/domain";

interface ProductFormModalProps {
  product: Product | null;
  onClose: () => void;
  onSubmit: (input: ProductInput) => Promise<void>;
}

export function ProductFormModal({ product, onClose, onSubmit }: ProductFormModalProps) {
  // Mounted only while a product is selected, so `form` below always starts
  // from the current product's values — no reset effect needed.
  if (!product) return null;
  return <ProductFormDialog product={product} onClose={onClose} onSubmit={onSubmit} />;
}

function ProductFormDialog({
  product,
  onClose,
  onSubmit,
}: Omit<ProductFormModalProps, "product"> & { product: Product }) {
  const [form, setForm] = useState<ProductInput>({
    price: product.price,
    isAvailable: product.isAvailable,
  });
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit() {
    setSubmitting(true);
    setError(null);
    try {
      await onSubmit(form);
    } catch (cause) {
      setError((cause as Error).message);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <dialog
      ref={(node) => node?.showModal()}
      onClose={onClose}
      className="w-full max-w-sm rounded-[var(--radius-panel)] border border-border bg-bg p-0 text-ink backdrop:bg-black/40"
    >
      <div className="flex flex-col gap-4 p-6">
        <div>
          <h2 className="text-lg font-semibold">{productLabelFor(product)}</h2>
          <p className="text-sm text-muted">{product.category}</p>
        </div>

        <label className="flex flex-col gap-1.5 text-sm">
          <span className="text-muted">Price (₦)</span>
          <input
            type="number"
            min={0}
            value={form.price}
            onChange={(e) => setForm((f) => ({ ...f, price: Number(e.target.value) }))}
            className="font-figures h-11 rounded-[var(--radius-control)] border border-border bg-surface px-3 text-ink focus-visible:outline focus-visible:outline-2 focus-visible:outline-primary"
          />
        </label>

        <label className="flex items-center gap-2 text-sm text-ink">
          <input
            type="checkbox"
            checked={form.isAvailable}
            onChange={(e) => setForm((f) => ({ ...f, isAvailable: e.target.checked }))}
            className="h-4 w-4 rounded border-border"
          />
          Available for sale
        </label>

        <p className="text-xs text-muted">
          Changes here only affect this terminal&apos;s display — renaming, adding, or removing products
          still happens in Zupa&apos;s own admin tool.
        </p>

        {error && <p className="text-sm text-danger">{error}</p>}

        <div className="flex gap-3 pt-2">
          <Button variant="secondary" className="flex-1" onClick={onClose} disabled={submitting}>
            Cancel
          </Button>
          <Button className="flex-1" onClick={submit} loading={submitting}>
            Save
          </Button>
        </div>
      </div>
    </dialog>
  );
}
