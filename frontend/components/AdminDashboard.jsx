"use client";

import { Boxes, CheckCircle2, TimerReset, Trash2 } from "lucide-react";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { api } from "@/src/lib/api";
import OrderCard from "./OrderCard";
import StoreBrand from "./StoreBrand";
import Toast from "./Toast";
import UploadInvoice from "./UploadInvoice";

export default function AdminDashboard() {
  const [orders, setOrders] = useState([]);
  const [loading, setLoading] = useState(true);
  const [toast, setToast] = useState(null);

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

  function removeOrder(orderId) {
    setOrders((currentOrders) => currentOrders.filter((order) => order._id !== orderId));
  }

  useEffect(() => {
    loadOrders();
    if ("serviceWorker" in navigator) {
      navigator.serviceWorker.register("/sw.js").catch(() => {});
    }
  }, []);

  const stats = useMemo(() => {
    const completedOrders = orders.filter((order) => order.packedStatus === "Completed" || order.packedStatus === "Packed");
    const pendingOrders = orders.filter((order) => order.packedStatus !== "Completed" && order.packedStatus !== "Packed");
    const pendingProductQuantity = pendingOrders.reduce((orderSum, order) => {
      const orderPendingQuantity = (order.items || []).reduce(
        (itemSum, item) => itemSum + Math.max((item.quantity || 0) - (item.packedQuantity || 0), 0),
        0
      );
      return orderSum + orderPendingQuantity;
    }, 0);

    return {
      pendingOrders,
      completedOrders,
      pendingOrderCount: pendingOrders.length,
      completedOrderCount: completedOrders.length,
      pendingProductQuantity
    };
  }, [orders]);

  const cards = [
    {
      href: "/pending/orders",
      label: "Pending Orders",
      value: stats.pendingOrderCount,
      icon: TimerReset,
      color: "bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-100"
    },
    {
      href: "/pending/products",
      label: "Pending Products",
      value: stats.pendingProductQuantity,
      icon: Boxes,
      color: "bg-sky-100 text-sky-800 dark:bg-sky-950 dark:text-sky-100"
    },
    {
      href: "#completed-orders",
      label: "Completed Orders",
      value: stats.completedOrderCount,
      icon: CheckCircle2,
      color: "bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-100"
    }
  ];

  return (
    <main className="min-h-screen safe-bottom">
      <Toast toast={toast} onClose={() => setToast(null)} />
      <div className="mx-auto max-w-6xl px-2.5 py-2.5 sm:px-5 sm:py-4 lg:px-8">
        <header className="mb-2.5 flex items-center justify-between gap-3 sm:mb-5">
          <StoreBrand />
          <Link href="/trash" className="grid h-10 w-10 shrink-0 place-items-center rounded-lg border border-black/10 bg-white text-red-700 shadow-sm dark:border-white/10 dark:bg-[#151f1a] dark:text-red-300" aria-label="Trash" title="Trash">
            <Trash2 size={17} />
          </Link>
        </header>

        <div className="mb-3 grid grid-cols-3 gap-1.5 sm:mb-4 sm:gap-2">
          {cards.map((card) => {
            const Icon = card.icon;
            const content = (
              <>
                <div className={`grid h-7 w-7 shrink-0 place-items-center rounded-lg sm:mb-2 sm:h-8 sm:w-8 ${card.color}`}>
                  <Icon size={15} />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-[10px] font-semibold leading-tight text-black/50 dark:text-white/50 sm:text-[11px]">{card.label}</p>
                  <p className="text-base font-black leading-tight sm:text-xl">{card.value}</p>
                </div>
              </>
            );

            return (
              <Link
                key={card.label}
                href={card.href}
                className="flex min-h-12 items-center gap-1.5 rounded-lg bg-white p-2 text-left shadow-sm transition hover:-translate-y-0.5 hover:shadow-soft dark:bg-[#151f1a] sm:block sm:min-h-0 sm:p-3"
              >
                {content}
              </Link>
            );
          })}
        </div>

        <div className="grid gap-3 lg:gap-4">
          <div>
            <UploadInvoice onUploaded={loadOrders} onToast={setToast} />
          </div>
          <section>
            <div className="mb-1.5 flex items-center justify-between">
              <h2 className="text-sm font-bold sm:text-base">Pending Orders</h2>
              <button onClick={loadOrders} className="min-h-9 rounded-lg border border-black/10 px-3 py-1.5 text-xs font-semibold dark:border-white/10 sm:min-h-10 sm:text-sm">
                Refresh
              </button>
            </div>
            {loading ? (
              <div className="grid gap-1.5 sm:grid-cols-2 sm:gap-2">
                {[1, 2, 3, 4].map((item) => (
                  <div key={item} className="h-20 animate-pulse rounded-lg bg-black/5 dark:bg-white/10" />
                ))}
              </div>
            ) : (
              <div className="grid gap-1.5 sm:grid-cols-2 sm:gap-2">
                {stats.pendingOrders.map((order) => (
                  <OrderCard key={order._id} order={order} onDeleted={removeOrder} onToast={setToast} compact />
                ))}
                {!stats.pendingOrders.length && (
                  <div className="rounded-lg bg-white p-6 text-center text-sm text-black/55 dark:bg-[#151f1a] dark:text-white/55">
                    No pending orders.
                  </div>
                )}
              </div>
            )}
          </section>
        </div>
        <section id="completed-orders" className="mt-4 sm:mt-6">
          <div className="mb-1.5 flex items-center justify-between">
            <h2 className="text-sm font-bold sm:text-base">Completed Orders</h2>
          </div>
          {loading ? null : (
            <div className="grid gap-1.5 sm:grid-cols-2 sm:gap-2 lg:grid-cols-3">
              {stats.completedOrders.map((order) => (
                <OrderCard key={order._id} order={order} onDeleted={removeOrder} onToast={setToast} compact />
              ))}
              {!stats.completedOrders.length && (
                <div className="rounded-lg bg-white p-6 text-center text-sm text-black/55 dark:bg-[#151f1a] dark:text-white/55">
                  No completed orders.
                </div>
              )}
            </div>
          )}
        </section>
      </div>
    </main>
  );
}
