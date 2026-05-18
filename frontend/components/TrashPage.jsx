"use client";

import Link from "next/link";
import { ArrowLeft, Loader2, RotateCcw, Trash2 } from "lucide-react";
import { useEffect, useState } from "react";
import { api } from "@/src/lib/api";
import StoreBrand from "./StoreBrand";
import Toast from "./Toast";

function getDeleteTime(trashedAt) {
  const deleteAt = new Date(new Date(trashedAt).getTime() + 24 * 60 * 60 * 1000);
  return deleteAt.toLocaleString();
}

export default function TrashPage() {
  const [orders, setOrders] = useState([]);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState(null);
  const [toast, setToast] = useState(null);

  async function loadTrash() {
    setLoading(true);
    try {
      const data = await api.trashedOrders();
      setOrders(data.orders || []);
    } catch (error) {
      setToast({ type: "error", message: error.message });
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadTrash();
  }, []);

  async function restoreOrder(orderId) {
    setBusyId(orderId);
    try {
      await api.restoreOrder(orderId);
      setOrders((current) => current.filter((order) => order._id !== orderId));
      setToast({ type: "success", message: "Order restored" });
    } catch (error) {
      setToast({ type: "error", message: error.message });
    } finally {
      setBusyId(null);
    }
  }

  async function permanentlyDeleteOrder(orderId) {
    if (!window.confirm("Permanently delete this order now? This cannot be undone.")) return;
    setBusyId(orderId);
    try {
      await api.permanentlyDeleteOrder(orderId);
      setOrders((current) => current.filter((order) => order._id !== orderId));
      setToast({ type: "success", message: "Order permanently deleted" });
    } catch (error) {
      setToast({ type: "error", message: error.message });
    } finally {
      setBusyId(null);
    }
  }

  return (
    <main className="min-h-screen safe-bottom">
      <Toast toast={toast} onClose={() => setToast(null)} />
      <div className="mx-auto max-w-4xl px-2.5 py-2.5 sm:px-5 sm:py-4">
        <header className="mb-3 flex items-center gap-2">
          <Link href="/" className="grid h-10 w-10 shrink-0 place-items-center rounded-lg border border-black/10 bg-white dark:border-white/10 dark:bg-[#151f1a]" aria-label="Back">
            <ArrowLeft size={18} />
          </Link>
          <div className="min-w-0 flex-1">
            <StoreBrand compact />
            <h1 className="mt-0.5 text-sm font-black sm:text-lg">Trash</h1>
          </div>
          <button onClick={loadTrash} className="min-h-9 rounded-lg border border-black/10 px-3 py-1.5 text-xs font-bold dark:border-white/10">
            Refresh
          </button>
        </header>

        {loading ? (
          <div className="grid min-h-[50vh] place-items-center">
            <Loader2 className="animate-spin text-leaf" size={34} />
          </div>
        ) : (
          <div className="grid gap-2">
            {orders.map((order) => (
              <section key={order._id} className="rounded-lg bg-white p-3 shadow-sm dark:bg-[#151f1a]">
                <div className="mb-2 flex items-start justify-between gap-2">
                  <div className="min-w-0 flex-1">
                    <h2 className="truncate text-sm font-black">{order.invoiceNo}</h2>
                    <p className="truncate text-xs text-black/60 dark:text-white/60">{order.customerName}</p>
                    <p className="mt-1 text-[11px] font-semibold text-red-700 dark:text-red-300">
                      Deletes after {getDeleteTime(order.trashedAt)}
                    </p>
                  </div>
                  <span className="shrink-0 rounded-full bg-black/5 px-2 py-0.5 text-[11px] font-bold dark:bg-white/10">
                    {order.items?.length || 0} items
                  </span>
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() => restoreOrder(order._id)}
                    disabled={busyId === order._id}
                    className="flex min-h-10 items-center justify-center gap-2 rounded-lg bg-leaf px-3 py-2 text-xs font-bold text-white disabled:opacity-60"
                  >
                    {busyId === order._id ? <Loader2 className="animate-spin" size={15} /> : <RotateCcw size={15} />}
                    Restore
                  </button>
                  <button
                    type="button"
                    onClick={() => permanentlyDeleteOrder(order._id)}
                    disabled={busyId === order._id}
                    className="flex min-h-10 items-center justify-center gap-2 rounded-lg border border-red-200 bg-white px-3 py-2 text-xs font-bold text-red-700 disabled:opacity-60 dark:border-red-900/70 dark:bg-[#151f1a] dark:text-red-300"
                  >
                    <Trash2 size={15} />
                    Delete Now
                  </button>
                </div>
              </section>
            ))}
            {!orders.length && (
              <div className="rounded-lg bg-white p-6 text-center text-sm text-black/55 shadow-sm dark:bg-[#151f1a] dark:text-white/55">
                Trash is empty.
              </div>
            )}
          </div>
        )}
      </div>
    </main>
  );
}
