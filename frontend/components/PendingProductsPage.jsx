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
      .filter((order) => order.packedStatus !== "Completed" && order.packedStatus !== "Packed")
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
      <div className="mx-auto max-w-4xl px-3 py-3 sm:px-5 lg:px-6">
        <header className="sticky top-0 z-20 -mx-3 mb-3 flex items-center gap-3 border-b border-black/5 bg-limewash/95 px-3 py-2 backdrop-blur dark:border-white/5 dark:bg-[#101714]/95 sm:static sm:mx-0 sm:border-0 sm:bg-transparent sm:px-0 sm:py-0 sm:backdrop-blur-none">
          <Link href="/" className="grid h-11 w-11 shrink-0 place-items-center rounded-lg border border-black/10 bg-white dark:border-white/10 dark:bg-[#151f1a]" aria-label="Back">
            <ArrowLeft size={18} />
          </Link>
          <div className="min-w-0 flex-1">
            <StoreBrand compact />
            <h1 className="mt-1 text-lg font-black">Pending Product Details</h1>
          </div>
        </header>

        {loading ? (
          <div className="grid min-h-[50vh] place-items-center">
            <Loader2 className="animate-spin text-leaf" size={34} />
          </div>
        ) : (
          <div className="grid gap-1.5">
            {pendingProducts.map((product) => (
              <section key={product.key} className="flex min-h-14 items-center justify-between gap-3 rounded-lg bg-white px-3 py-2.5 shadow-sm dark:bg-[#151f1a] sm:min-h-12 sm:py-2">
                <p className="min-w-0 flex-1 text-sm font-bold leading-snug">{product.productName}</p>
                <p className="shrink-0 rounded-full bg-amber-100 px-2.5 py-1 text-sm font-black text-amber-800 dark:bg-amber-950 dark:text-amber-100">
                  {formatQty(product.pendingQuantity)}
                </p>
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
