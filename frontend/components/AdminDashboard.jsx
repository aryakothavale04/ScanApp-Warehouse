"use client";

import { Boxes, TimerReset } from "lucide-react";
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
    const pendingOrders = orders.filter((order) => order.packedStatus !== "Packed");
    const pendingProductQuantity = pendingOrders.reduce((orderSum, order) => {
      const orderPendingQuantity = (order.items || []).reduce(
        (itemSum, item) => itemSum + Math.max((item.quantity || 0) - (item.packedQuantity || 0), 0),
        0
      );
      return orderSum + orderPendingQuantity;
    }, 0);

    return {
      pendingOrders,
      pendingOrderCount: pendingOrders.length,
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
    }
  ];

  return (
    <main className="min-h-screen safe-bottom">
      <Toast toast={toast} onClose={() => setToast(null)} />
      <div className="mx-auto max-w-6xl px-4 py-4 sm:px-6 lg:px-8">
        <header className="mb-5 flex items-center justify-between gap-3">
          <StoreBrand />
        </header>

        <div className="mb-5 grid grid-cols-2 gap-3">
          {cards.map((card) => {
            const Icon = card.icon;
            const content = (
              <>
                <div className={`mb-3 grid h-10 w-10 place-items-center rounded-lg ${card.color}`}>
                  <Icon size={20} />
                </div>
                <p className="text-xs text-black/50 dark:text-white/50">{card.label}</p>
                <p className="text-2xl font-black">{card.value}</p>
              </>
            );

            return (
              <Link
                key={card.label}
                href={card.href}
                className="rounded-lg bg-white p-4 text-left shadow-sm transition hover:-translate-y-0.5 hover:shadow-soft dark:bg-[#151f1a]"
              >
                {content}
              </Link>
            );
          })}
        </div>

        <div className="grid gap-5 lg:grid-cols-[360px_1fr]">
          <UploadInvoice onUploaded={loadOrders} onToast={setToast} />
          <section>
            <div className="mb-3 flex items-center justify-between">
              <h2 className="text-lg font-bold">Pending Orders</h2>
              <button onClick={loadOrders} className="rounded-lg border border-black/10 px-3 py-2 text-sm font-semibold dark:border-white/10">
                Refresh
              </button>
            </div>
            {loading ? (
              <div className="grid gap-3 sm:grid-cols-2">
                {[1, 2, 3, 4].map((item) => (
                  <div key={item} className="h-56 animate-pulse rounded-lg bg-black/5 dark:bg-white/10" />
                ))}
              </div>
            ) : (
              <div className="grid gap-3 sm:grid-cols-2">
                {stats.pendingOrders.map((order) => (
                  <OrderCard key={order._id} order={order} onDeleted={removeOrder} onToast={setToast} />
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
      </div>
    </main>
  );
}
