"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { ProductFormModal } from "@/components/admin/ProductFormModal";
import { getApi } from "@/lib/ipc/client";
import { formatNaira } from "@/lib/format";
import { productLabelFor } from "@/shared/productLabel";
import { useSession } from "@/lib/session";
import { canManageCatalog } from "@/shared/permissions";
import type { Product, ProductInput, ProductSource } from "@/shared/types/domain";

const SOURCE_LABEL: Record<ProductSource, string> = {
  csv_import: "Terminal",
  manual: "Terminal",
  zupa_catalog: "Zupa",
};

export default function ProductsPage() {
  const router = useRouter();
  const { session } = useSession();
  const [products, setProducts] = useState<Product[]>([]);
  const [editing, setEditing] = useState<Product | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (session && !canManageCatalog(session.accessRole)) {
      router.replace("/pos");
    }
  }, [session, router]);

  async function load() {
    setProducts(await getApi().catalog.listProducts());
  }

  useEffect(() => {
    let cancelled = false;
    getApi()
      .catalog.listProducts()
      .then((p) => {
        if (!cancelled) setProducts(p);
      });
    return () => {
      cancelled = true;
    };
  }, []);

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

  const categories = [...new Set(products.map((p) => p.category))].sort((a, b) => a.localeCompare(b));

  return (
    <div className="h-full overflow-y-auto p-8">
      <div className="flex flex-col gap-6">
        <div>
          <h1 className="text-xl font-semibold text-ink">Products</h1>
          <p className="text-sm text-muted">
            Pulled from Zupa&apos;s Terminal API (both the Zupa and Terminal catalogs). Price/availability edits
            here are local to this terminal only — adding, renaming, or removing products still happens in
            Zupa&apos;s own admin tool.
          </p>
        </div>

        {error && <p className="text-sm text-danger">{error}</p>}

        <div className="flex flex-col gap-4">
          {categories.map((category) => {
            const rows = products.filter((p) => p.category === category);
            return (
              <div key={category} className="overflow-hidden rounded-[var(--radius-panel)] border border-border">
                <div className="bg-surface px-4 py-2.5">
                  <span className="text-sm font-medium text-ink">{category}</span>
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <tbody className="divide-y divide-border">
                      {rows.map((p) => (
                        <tr key={p.id}>
                          <td className="px-4 py-2.5 text-ink">{productLabelFor(p)}</td>
                          <td className="px-4 py-2.5 text-muted">{SOURCE_LABEL[p.source]}</td>
                          <td className="font-figures px-4 py-2.5 text-ink">{formatNaira(p.price)}</td>
                          <td className="px-4 py-2.5">
                            <span
                              className={`rounded-full px-2 py-0.5 text-xs font-medium ${
                                p.isAvailable ? "bg-success/15 text-success" : "bg-muted/15 text-muted"
                              }`}
                            >
                              {p.isAvailable ? "Available" : "Hidden"}
                            </span>
                          </td>
                          <td className="px-4 py-2.5 text-right">
                            <button
                              onClick={() => setEditing(p)}
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
              </div>
            );
          })}
          {products.length === 0 && (
            <p className="py-10 text-center text-muted">No products yet — waiting on the next catalog sync.</p>
          )}
        </div>

        <ProductFormModal product={editing} onClose={() => setEditing(null)} onSubmit={handleSubmit} />
      </div>
    </div>
  );
}
