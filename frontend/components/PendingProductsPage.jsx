"use client";

import Link from "next/link";
import { ArrowLeft, Loader2 } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { api } from "@/src/lib/api";
import StoreBrand from "./StoreBrand";
import Toast from "./Toast";

function formatQty(value) {
  const number = Number(value) || 0;
  return Number.isInteger(number) ? number : Number(number.toFixed(3));
}

export default function PendingProductsPage() {
  const [orders, setOrders] = useState([]);
  const [loading, setLoading] = useState(true);
  const [toast, setToast] = useState(null);

  useEffect(() => {
    async function loadOrders() {
      setLoading(true);
      try {
        const data = await api.orders();
        setOrders(data.orders || []);
      } catch (error) {
        setToast({ type: "error", message: error.message });
      } finally {
        setLoading(false);
      }
    }

    loadOrders();
  }, []);

  const pendingProducts = useMemo(() => {
    const groups = new Map();

    orders
      .filter((order) => order.packedStatus !== "Packed")
      .forEach((order) => {
        (order.items || []).forEach((item) => {
          const pendingQuantity = Math.max((item.quantity || 0) - (item.packedQuantity || 0), 0);
          if (!pendingQuantity) return;

          const productName = (item.productName || "").trim();
          const key = productName;
          const existing = groups.get(key) || {
            key,
            productName,
            pendingQuantity: 0
          };

          existing.pendingQuantity += pendingQuantity;
          groups.set(key, existing);
        });
      });

    return Array.from(groups.values()).sort((first, second) => first.productName.localeCompare(second.productName));
  }, [orders]);

  return (
    <main className="min-h-screen safe-bottom">
      <Toast toast={toast} onClose={() => setToast(null)} />
      <div className="mx-auto max-w-4xl px-4 py-4 sm:px-6 lg:px-8">
        <header className="mb-5 flex items-center gap-3">
          <Link href="/" className="grid h-10 w-10 place-items-center rounded-lg border border-black/10 bg-white dark:border-white/10 dark:bg-[#151f1a]" aria-label="Back">
            <ArrowLeft size={18} />
          </Link>
          <div className="min-w-0 flex-1">
            <StoreBrand compact />
            <h1 className="mt-2 text-xl font-black">Pending Product Details</h1>
          </div>
        </header>

        {loading ? (
          <div className="grid min-h-[50vh] place-items-center">
            <Loader2 className="animate-spin text-leaf" size={34} />
          </div>
        ) : (
          <div className="space-y-2">
            {pendingProducts.map((product) => (
              <section key={product.key} className="flex items-center justify-between gap-3 rounded-lg bg-white p-4 shadow-sm dark:bg-[#151f1a]">
                <p className="min-w-0 flex-1 text-sm font-bold leading-snug">{product.productName}</p>
                <p className="shrink-0 text-sm font-black">{formatQty(product.pendingQuantity)}</p>
              </section>
            ))}
            {!pendingProducts.length && (
              <div className="rounded-lg bg-white p-6 text-center text-sm text-black/55 shadow-sm dark:bg-[#151f1a] dark:text-white/55">
                No pending products.
              </div>
            )}
          </div>
        )}
      </div>
    </main>
  );
}
