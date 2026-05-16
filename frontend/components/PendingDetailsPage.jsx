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

function getPendingItems(order) {
  return (order.items || [])
    .map((item, itemIndex) => ({
      ...item,
      itemIndex,
      pendingQuantity: Math.max((item.quantity || 0) - (item.packedQuantity || 0), 0)
    }))
    .filter((item) => item.pendingQuantity > 0);
}

export default function PendingDetailsPage() {
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

  const stats = useMemo(() => {
    const pendingOrders = orders.filter((order) => order.packedStatus !== "Packed");

    return {
      pendingOrders
    };
  }, [orders]);

  return (
    <main className="min-h-screen safe-bottom">
      <Toast toast={toast} onClose={() => setToast(null)} />
      <div className="mx-auto max-w-6xl px-4 py-4 sm:px-6 lg:px-8">
        <header className="mb-5 flex items-center gap-3">
          <Link href="/" className="grid h-10 w-10 place-items-center rounded-lg border border-black/10 bg-white dark:border-white/10 dark:bg-[#151f1a]" aria-label="Back">
            <ArrowLeft size={18} />
          </Link>
          <div className="min-w-0 flex-1">
            <StoreBrand compact />
            <h1 className="mt-2 text-xl font-black">Pending Order Details</h1>
          </div>
        </header>

        {loading ? (
          <div className="grid min-h-[50vh] place-items-center">
            <Loader2 className="animate-spin text-leaf" size={34} />
          </div>
        ) : (
          <div className="space-y-4">
            {stats.pendingOrders.map((order) => {
              const pendingItems = getPendingItems(order);
              const pendingQuantity = pendingItems.reduce((sum, item) => sum + item.pendingQuantity, 0);

              return (
                <section key={order._id} className="rounded-lg bg-white p-4 shadow-sm dark:bg-[#151f1a]">
                  <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <p className="text-xs uppercase tracking-wide text-black/45 dark:text-white/45">Invoice</p>
                      <h2 className="text-lg font-black">{order.invoiceNo}</h2>
                      <p className="mt-1 text-sm text-black/60 dark:text-white/60">{order.customerName}</p>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="rounded-full bg-amber-100 px-3 py-1 text-xs font-bold text-amber-800 dark:bg-amber-950 dark:text-amber-100">
                        {formatQty(pendingQuantity)} pending
                      </span>
                      <Link href={`/orders/${order._id}`} className="rounded-lg bg-leaf px-3 py-2 text-sm font-bold text-white">
                        Open Order
                      </Link>
                    </div>
                  </div>

                  <div className="grid gap-2">
                    {pendingItems.map((item) => (
                      <div
                        key={`${order._id}-${item.itemIndex}-${item.productId?._id || item.productId || item.hsnOrBarcode || item.productName}`}
                        className="rounded-lg bg-limewash p-3 dark:bg-white/5"
                      >
                        <div className="mb-2 flex flex-wrap items-start justify-between gap-2">
                          <p className="min-w-0 flex-1 text-sm font-bold leading-snug">{item.productName}</p>
                          <span className="rounded-full bg-amber-100 px-2 py-0.5 text-xs font-bold text-amber-800 dark:bg-amber-950 dark:text-amber-100">
                            {formatQty(item.pendingQuantity)} pending
                          </span>
                        </div>
                        <div className="grid grid-cols-3 gap-2 text-xs">
                          <div>
                            <p className="text-black/45 dark:text-white/45">Required</p>
                            <p className="font-bold">{formatQty(item.quantity)}</p>
                          </div>
                          <div>
                            <p className="text-black/45 dark:text-white/45">Packed</p>
                            <p className="font-bold">{formatQty(item.packedQuantity)}</p>
                          </div>
                          <div>
                            <p className="text-black/45 dark:text-white/45">Pending</p>
                            <p className="font-bold">{formatQty(item.pendingQuantity)}</p>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </section>
              );
            })}
            {!stats.pendingOrders.length && <EmptyState message="No pending orders." />}
          </div>
        )}
      </div>
    </main>
  );
}

function EmptyState({ message }) {
  return (
    <div className="rounded-lg bg-white p-6 text-center text-sm text-black/55 shadow-sm dark:bg-[#151f1a] dark:text-white/55">
      {message}
    </div>
  );
}
