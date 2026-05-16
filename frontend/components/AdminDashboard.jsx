"use client";

import { Package, PackageCheck, TimerReset, TrendingUp } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { api } from "@/src/lib/api";
import OrderCard from "./OrderCard";
import ThemeToggle from "./ThemeToggle";
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

  useEffect(() => {
    loadOrders();
    if ("serviceWorker" in navigator) {
      navigator.serviceWorker.register("/sw.js").catch(() => {});
    }
  }, []);

  const stats = useMemo(() => {
    const pending = orders.filter((order) => order.packedStatus !== "Packed").length;
    const packed = orders.filter((order) => order.packedStatus === "Packed").length;
    const totalQty = orders.reduce((sum, order) => sum + (order.progress?.totalQuantity || 0), 0);
    const packedQty = orders.reduce((sum, order) => sum + (order.progress?.packedQuantity || 0), 0);
    return { pending, packed, totalQty, packedQty };
  }, [orders]);

  const cards = [
    { label: "Pending Orders", value: stats.pending, icon: TimerReset, color: "bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-100" },
    { label: "Packed Orders", value: stats.packed, icon: PackageCheck, color: "bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-100" },
    { label: "Total Qty", value: stats.totalQty, icon: Package, color: "bg-sky-100 text-sky-800 dark:bg-sky-950 dark:text-sky-100" },
    { label: "Packed Qty", value: stats.packedQty, icon: TrendingUp, color: "bg-violet-100 text-violet-800 dark:bg-violet-950 dark:text-violet-100" }
  ];

  return (
    <main className="min-h-screen safe-bottom">
      <Toast toast={toast} onClose={() => setToast(null)} />
      <div className="mx-auto max-w-6xl px-4 py-4 sm:px-6 lg:px-8">
        <header className="mb-5 flex items-center justify-between gap-3">
          <div>
            <p className="text-sm font-semibold text-leaf">Packing Management</p>
            <h1 className="text-2xl font-black sm:text-3xl">ScanApp Warehouse</h1>
            <p className="mt-1 text-sm text-black/55 dark:text-white/55">जलद स्कॅनिंग, कमी चुका, live packing status.</p>
          </div>
          <ThemeToggle />
        </header>

        <div className="mb-5 grid grid-cols-2 gap-3 lg:grid-cols-4">
          {cards.map((card) => {
            const Icon = card.icon;
            return (
              <section key={card.label} className="rounded-lg bg-white p-4 shadow-sm dark:bg-[#151f1a]">
                <div className={`mb-3 grid h-10 w-10 place-items-center rounded-lg ${card.color}`}>
                  <Icon size={20} />
                </div>
                <p className="text-xs text-black/50 dark:text-white/50">{card.label}</p>
                <p className="text-2xl font-black">{card.value}</p>
              </section>
            );
          })}
        </div>

        <div className="grid gap-5 lg:grid-cols-[360px_1fr]">
          <UploadInvoice onUploaded={loadOrders} onToast={setToast} />
          <section>
            <div className="mb-3 flex items-center justify-between">
              <h2 className="text-lg font-bold">Orders</h2>
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
                {orders.map((order) => <OrderCard key={order._id} order={order} />)}
                {!orders.length && (
                  <div className="rounded-lg bg-white p-6 text-center text-sm text-black/55 dark:bg-[#151f1a] dark:text-white/55">
                    No orders yet. Upload a Vyapar invoice PDF to begin.
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
