"use client";

import Link from "next/link";
import { CheckCircle2, ClipboardList, Loader2, PackageCheck, Trash2 } from "lucide-react";
import { useState } from "react";
import { api } from "@/src/lib/api";
import ProgressRing from "./ProgressRing";

export default function OrderCard({ order, onDeleted, onToast, compact = false }) {
  const [deleting, setDeleting] = useState(false);
  const totals = order.progress || {
    totalQuantity: order.items?.reduce((sum, item) => sum + item.quantity, 0) || 0,
    packedQuantity: order.items?.reduce((sum, item) => sum + item.packedQuantity, 0) || 0
  };
  const completed = order.packedStatus === "Completed" || order.packedStatus === "Packed";
  const statusLabel = completed ? "Completed" : order.packedStatus;
  const percent = totals.totalQuantity ? Math.min(100, Math.round((totals.packedQuantity / totals.totalQuantity) * 100)) : 0;

  async function handleDelete() {
    const confirmed = window.confirm(`Delete order ${order.invoiceNo}?`);
    if (!confirmed) return;

    setDeleting(true);
    try {
      await api.deleteOrder(order._id);
      onToast?.({ type: "success", message: "Order deleted" });
      onDeleted?.(order._id);
    } catch (error) {
      onToast?.({ type: "error", message: error.message });
    } finally {
      setDeleting(false);
    }
  }

  return (
    <article className={`rounded-lg border border-black/10 bg-white shadow-sm transition hover:-translate-y-0.5 hover:shadow-soft dark:border-white/10 dark:bg-[#151f1a] ${compact ? "p-3" : "p-4"}`}>
      <Link href={`/orders/${order._id}`} className="block">
        <div className={`flex items-start justify-between gap-2 sm:gap-3 ${compact ? "mb-3" : "mb-4"}`}>
          <div className="min-w-0 flex-1">
            <p className="text-xs uppercase tracking-wide text-black/45 dark:text-white/45">Invoice</p>
            <h3 className={`${compact ? "text-base" : "text-lg"} truncate font-bold`}>{order.invoiceNo}</h3>
            <p className="mt-0.5 truncate text-sm text-black/60 dark:text-white/60">{order.customerName}</p>
          </div>
          <span className={`flex shrink-0 items-center gap-1 rounded-full px-2 py-1 text-xs font-semibold sm:px-2.5 ${completed ? "bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-100" : "bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-100"}`}>
            {completed ? <CheckCircle2 size={14} /> : <ClipboardList size={14} />}
            {statusLabel}
          </span>
        </div>
        {compact ? (
          <>
            <div className="mb-2 flex items-center justify-between gap-2 text-xs font-semibold text-black/60 dark:text-white/60">
              <span>{order.items?.length || 0} items</span>
              <span className="flex items-center gap-1">
                <PackageCheck size={14} /> {totals.packedQuantity}/{totals.totalQuantity}
              </span>
            </div>
            <div className="h-2 overflow-hidden rounded-full bg-black/10 dark:bg-white/10">
              <div className={`h-full rounded-full ${completed ? "bg-emerald-600" : "bg-saffron"}`} style={{ width: `${percent}%` }} />
            </div>
          </>
        ) : (
          <>
            <div className="mb-4 grid grid-cols-2 gap-3 text-sm">
              <div className="rounded-lg bg-limewash p-3 dark:bg-white/5">
                <p className="text-black/50 dark:text-white/50">Items</p>
                <p className="text-xl font-bold">{order.items?.length || 0}</p>
              </div>
              <div className="rounded-lg bg-limewash p-3 dark:bg-white/5">
                <p className="text-black/50 dark:text-white/50">Packed Qty</p>
                <p className="flex items-center gap-1 text-xl font-bold">
                  <PackageCheck size={18} /> {totals.packedQuantity}
                </p>
              </div>
            </div>
            <ProgressRing packed={totals.packedQuantity} total={totals.totalQuantity} />
          </>
        )}
      </Link>

      <button
        type="button"
        onClick={handleDelete}
        disabled={deleting}
        className={`${compact ? "mt-3 min-h-10 py-2" : "mt-4 min-h-11 py-2"} flex w-full items-center justify-center gap-2 rounded-lg border border-red-200 px-3 text-sm font-semibold text-red-700 transition hover:bg-red-50 disabled:opacity-60 dark:border-red-900/70 dark:text-red-300 dark:hover:bg-red-950/40`}
      >
        {deleting ? <Loader2 className="animate-spin" size={16} /> : <Trash2 size={16} />}
        Delete Order
      </button>
    </article>
  );
}
