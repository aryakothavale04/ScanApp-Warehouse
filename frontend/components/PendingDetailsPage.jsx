"use client";

import Link from "next/link";
import { Loader2 } from "lucide-react";
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
    const pendingOrders = orders.filter((order) => order.packedStatus !== "Completed" && order.packedStatus !== "Packed");

    return {
      pendingOrders
    };
  }, [orders]);

  return (
    <main className="min-h-screen safe-bottom">
      <Toast toast={toast} onClose={() => setToast(null)} />
      <div className="mx-auto max-w-6xl px-3 py-3 sm:px-5 lg:px-6">
        <header className="-mx-3 mb-3 grid gap-1 border-b border-black/5 bg-limewash/95 px-3 py-2 backdrop-blur dark:border-white/5 dark:bg-[#101714]/95 sm:static sm:mx-0 sm:border-0 sm:bg-transparent sm:px-0 sm:py-0 sm:backdrop-blur-none">
          <div className="min-w-0">
            <StoreBrand />
            <h1 className="mt-1 text-lg font-black">Pending Order Details</h1>
          </div>
        </header>

        {loading ? (
          <div className="grid min-h-[50vh] place-items-center">
            <Loader2 className="animate-spin text-leaf" size={34} />
          </div>
        ) : (
          <div className="space-y-3">
            {stats.pendingOrders.map((order) => {
              const pendingItems = getPendingItems(order);
              const pendingQuantity = pendingItems.reduce((sum, item) => sum + item.pendingQuantity, 0);

              return (
                <section key={order._id} className="rounded-lg bg-white p-3 shadow-sm dark:bg-[#151f1a]">
                  <div className="mb-3 grid gap-2 sm:flex sm:items-center sm:justify-between">
                    <div className="min-w-0 flex-1">
                      <p className="text-xs uppercase tracking-wide text-black/45 dark:text-white/45">Invoice</p>
                      <h2 className="truncate text-base font-black">{order.invoiceNo}</h2>
                      <p className="truncate text-sm text-black/60 dark:text-white/60">{order.customerName}</p>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="rounded-full bg-amber-100 px-2.5 py-1 text-xs font-bold text-amber-800 dark:bg-amber-950 dark:text-amber-100">
                        {formatQty(pendingQuantity)} pending
                      </span>
                      <Link href={`/orders/${order._id}`} className="grid min-h-11 flex-1 place-items-center rounded-lg bg-leaf px-4 py-2 text-sm font-bold text-white sm:flex-none">
                        Open
                      </Link>
                    </div>
                  </div>

                  <div className="grid gap-1.5">
                    {pendingItems.map((item) => (
                      <div
                        key={`${order._id}-${item.itemIndex}-${item.productId?._id || item.productId || item.hsnOrBarcode || item.productName}`}
                        className="grid min-h-12 grid-cols-[1fr_auto] items-center gap-2 rounded-lg bg-limewash px-3 py-2 dark:bg-white/5 sm:grid-cols-[1fr_72px_72px_82px]"
                      >
                        <p className="min-w-0 truncate text-sm font-bold leading-snug">{item.productName}</p>
                        <span className="rounded-full bg-amber-100 px-2 py-0.5 text-right text-xs font-bold text-amber-800 dark:bg-amber-950 dark:text-amber-100 sm:hidden">
                          {formatQty(item.pendingQuantity)}
                        </span>
                        <div className="hidden text-xs sm:block">
                          <p className="text-black/45 dark:text-white/45">Req</p>
                          <p className="font-bold">{formatQty(item.quantity)}</p>
                        </div>
                        <div className="hidden text-xs sm:block">
                          <p className="text-black/45 dark:text-white/45">Packed</p>
                          <p className="font-bold">{formatQty(item.packedQuantity)}</p>
                        </div>
                        <div className="hidden text-xs sm:block">
                          <p className="text-black/45 dark:text-white/45">Pending</p>
                          <p className="font-bold">{formatQty(item.pendingQuantity)}</p>
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
