"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { ProductFormModal } from "@/components/admin/ProductFormModal";
import { getApi } from "@/lib/ipc/client";
import { formatNaira } from "@/lib/format";
import { useSession } from "@/lib/session";
import { canManageCatalog } from "@/shared/permissions";
import type { BaseProduct, Category, CategorySize, Product, ProductInput } from "@/shared/types/domain";

export default function ProductsPage() {
  const router = useRouter();
  const { session } = useSession();
  const [baseProducts, setBaseProducts] = useState<BaseProduct[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [categorySizes, setCategorySizes] = useState<CategorySize[]>([]);
  const [editing, setEditing] = useState<Product | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (session && !canManageCatalog(session.accessRole)) {
      router.replace("/pos");
    }
  }, [session, router]);

  async function load() {
    const [bp, p, c, cs] = await Promise.all([
      getApi().catalog.listBaseProducts(),
      getApi().catalog.listProducts(),
      getApi().catalog.listCategories(),
      getApi().catalog.listCategorySizes(),
    ]);
    setBaseProducts(bp);
    setProducts(p);
    setCategories(c);
    setCategorySizes(cs);
  }

  useEffect(() => {
    let cancelled = false;
    Promise.all([
      getApi().catalog.listBaseProducts(),
      getApi().catalog.listProducts(),
      getApi().catalog.listCategories(),
      getApi().catalog.listCategorySizes(),
    ]).then(([bp, p, c, cs]) => {
      if (cancelled) return;
      setBaseProducts(bp);
      setProducts(p);
      setCategories(c);
      setCategorySizes(cs);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  const categoryName = (id: string | null) => categories.find((c) => c.id === id)?.name ?? "—";
  const sizeName = (id: string | null) => categorySizes.find((s) => s.id === id)?.name ?? "Standard";

  async function handleSubmit(input: ProductInput) {
    if (!editing) return;
    setError(null);
    try {
      await getApi().catalog.updateProductLocal(editing.id, input);
      setEditing(null);
      await load();
    } catch (cause) {
      setError((cause as Error).message);
    }
  }

  if (!session || !canManageCatalog(session.accessRole)) {
    return null;
  }

  return (
    <div className="h-full overflow-y-auto p-8">
      <div className="flex flex-col gap-6">
        <div>
          <h1 className="text-xl font-semibold text-ink">Products</h1>
          <p className="text-sm text-muted">
            Pulled from Zupa. Price/availability/stock edits here are local to this terminal only — adding,
            renaming, or removing products still happens in Zupa&apos;s own admin tool.
          </p>
        </div>

        {error && <p className="text-sm text-danger">{error}</p>}

        <div className="flex flex-col gap-4">
          {baseProducts.map((bp) => {
            const variants = products.filter((p) => p.baseProductId === bp.id);
            if (variants.length === 0) return null;
            return (
              <div key={bp.id} className="overflow-hidden rounded-[var(--radius-panel)] border border-border">
                <div className="flex items-center justify-between bg-surface px-4 py-2.5">
                  <span className="text-sm font-medium text-ink">{bp.name}</span>
                  <span className="text-xs text-muted">{categoryName(bp.categoryId)}</span>
                </div>
                <table className="w-full text-sm">
                  <tbody className="divide-y divide-border">
                    {variants.map((v) => (
                      <tr key={v.id}>
                        <td className="px-4 py-2.5 text-muted">{sizeName(v.categorySizeId)}</td>
                        <td className="font-figures px-4 py-2.5 text-ink">{formatNaira(v.unitPrice)}</td>
                        <td className="font-figures px-4 py-2.5 text-ink">{v.quantity}</td>
                        <td className="px-4 py-2.5">
                          <span
                            className={`rounded-full px-2 py-0.5 text-xs font-medium ${
                              v.isAvailable ? "bg-success/15 text-success" : "bg-muted/15 text-muted"
                            }`}
                          >
                            {v.isAvailable ? "Available" : "Hidden"}
                          </span>
                        </td>
                        <td className="px-4 py-2.5 text-right">
                          <button
                            onClick={() => setEditing(v)}
                            className="text-sm font-medium text-primary hover:underline"
                          >
                            Edit
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            );
          })}
          {baseProducts.length === 0 && (
            <p className="py-10 text-center text-muted">No products yet — waiting on the next catalog sync.</p>
          )}
        </div>

        <ProductFormModal
          product={editing}
          sizeName={editing ? sizeName(editing.categorySizeId) : ""}
          onClose={() => setEditing(null)}
          onSubmit={handleSubmit}
        />
      </div>
    </div>
  );
}
