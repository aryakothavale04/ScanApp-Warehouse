"use client";

import { Loader2, RotateCcw, Trash2 } from "lucide-react";
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
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState(null);
  const [deleteOrder, setDeleteOrder] = useState(null);
  const [emptyOpen, setEmptyOpen] = useState(false);
  const [toast, setToast] = useState(null);

  async function loadTrash() {
    setLoading(true);
    try {
      const data = await api.trashedOrders();
      setOrders(data.orders || []);
      setItems(data.items || []);
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
    setBusyId(orderId);
    try {
      await api.permanentlyDeleteOrder(orderId);
      setOrders((current) => current.filter((order) => order._id !== orderId));
      setDeleteOrder(null);
      setToast({ type: "success", message: "Order permanently deleted" });
    } catch (error) {
      setToast({ type: "error", message: error.message });
    } finally {
      setBusyId(null);
    }
  }

  async function emptyTrash() {
    setBusyId("empty-trash");
    try {
      const data = await api.emptyTrash();
      setOrders([]);
      setItems([]);
      setEmptyOpen(false);
      setDeleteOrder(null);
      setToast({ type: "success", message: data.message || "Trash emptied" });
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
        <header className="-mx-2.5 mb-3 grid gap-1 border-b border-black/5 bg-limewash/95 px-2.5 py-2 backdrop-blur dark:border-white/5 dark:bg-[#101714]/95 sm:static sm:mx-0 sm:border-0 sm:bg-transparent sm:px-0 sm:py-0 sm:backdrop-blur-none">
          <div className="min-w-0">
            <StoreBrand />
            <h1 className="mt-0.5 text-sm font-black sm:text-lg">Trash</h1>
          </div>
          {!loading && (orders.length || items.length) ? (
            <button
              type="button"
              onClick={() => setEmptyOpen(true)}
              disabled={busyId === "empty-trash"}
              className="mt-2 flex min-h-9 w-full items-center justify-center gap-2 rounded-lg border border-red-200 bg-white px-3 py-1.5 text-xs font-bold text-red-700 disabled:opacity-60 dark:border-red-900/70 dark:bg-[#151f1a] dark:text-red-300 sm:w-auto"
            >
              {busyId === "empty-trash" ? <Loader2 className="animate-spin" size={15} /> : <Trash2 size={15} />}
              Empty all trash
            </button>
          ) : null}
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
                    onClick={() => setDeleteOrder(order)}
                    disabled={busyId === order._id}
                    className="flex min-h-10 items-center justify-center gap-2 rounded-lg border border-red-200 bg-white px-3 py-2 text-xs font-bold text-red-700 disabled:opacity-60 dark:border-red-900/70 dark:bg-[#151f1a] dark:text-red-300"
                  >
                    <Trash2 size={15} />
                    Delete Now
                  </button>
                </div>
              </section>
            ))}
            {items.map((item) => (
              <section key={`${item.orderId}-${item.originalIndex}-${item.trashedAt}`} className="rounded-lg bg-white p-3 shadow-sm dark:bg-[#151f1a]">
                <div className="mb-2 flex items-start justify-between gap-2">
                  <div className="min-w-0 flex-1">
                    <h2 className="truncate text-sm font-black">{item.productName || item.itemName || "Deleted product"}</h2>
                    <p className="truncate text-xs text-black/60 dark:text-white/60">
                      Invoice {item.invoiceNo} - {item.customerName}
                    </p>
                    <p className="mt-1 text-[11px] font-semibold text-red-700 dark:text-red-300">
                      Deletes after {getDeleteTime(item.trashedAt)}
                    </p>
                  </div>
                  <span className="shrink-0 rounded-full bg-black/5 px-2 py-0.5 text-[11px] font-bold dark:bg-white/10">
                    Qty {item.quantity || 0}
                  </span>
                </div>
              </section>
            ))}
            {!orders.length && !items.length && (
              <div className="rounded-lg bg-white p-6 text-center text-sm text-black/55 shadow-sm dark:bg-[#151f1a] dark:text-white/55">
                Trash is empty.
              </div>
            )}
          </div>
        )}
      </div>
      {deleteOrder && (
        <div className="fixed inset-0 z-50 grid place-items-end bg-black/45 p-2.5 sm:place-items-center sm:p-3">
          <section className="w-full max-w-md rounded-lg bg-white p-3 shadow-soft dark:bg-[#151f1a] sm:p-4">
            <div className="mb-4">
              <h2 className="text-base font-black sm:text-lg">Delete order permanently?</h2>
              <p className="mt-1 text-sm text-black/60 dark:text-white/60">
                {deleteOrder.invoiceNo} for {deleteOrder.customerName} will be removed from trash.
              </p>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => setDeleteOrder(null)}
                disabled={busyId === deleteOrder._id}
                className="min-h-11 rounded-lg border border-black/10 px-4 py-2 text-sm font-bold dark:border-white/10"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => permanentlyDeleteOrder(deleteOrder._id)}
                disabled={busyId === deleteOrder._id}
                className="flex min-h-11 items-center justify-center gap-2 rounded-lg bg-red-600 px-4 py-2 text-sm font-bold text-white disabled:opacity-60"
              >
                {busyId === deleteOrder._id ? <Loader2 className="animate-spin" size={16} /> : <Trash2 size={16} />}
                Delete
              </button>
            </div>
          </section>
        </div>
      )}
      {emptyOpen && (
        <div className="fixed inset-0 z-50 grid place-items-end bg-black/45 p-2.5 sm:place-items-center sm:p-3">
          <section className="w-full max-w-md rounded-lg bg-white p-3 shadow-soft dark:bg-[#151f1a] sm:p-4">
            <div className="mb-4">
              <h2 className="text-base font-black sm:text-lg">Empty all trash?</h2>
              <p className="mt-1 text-sm text-black/60 dark:text-white/60">
                This will permanently delete all trashed orders and deleted products now.
              </p>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => setEmptyOpen(false)}
                disabled={busyId === "empty-trash"}
                className="min-h-11 rounded-lg border border-black/10 px-4 py-2 text-sm font-bold dark:border-white/10"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={emptyTrash}
                disabled={busyId === "empty-trash"}
                className="flex min-h-11 items-center justify-center gap-2 rounded-lg bg-red-600 px-4 py-2 text-sm font-bold text-white disabled:opacity-60"
              >
                {busyId === "empty-trash" ? <Loader2 className="animate-spin" size={16} /> : <Trash2 size={16} />}
                Empty
              </button>
            </div>
          </section>
        </div>
      )}
    </main>
  );
}
