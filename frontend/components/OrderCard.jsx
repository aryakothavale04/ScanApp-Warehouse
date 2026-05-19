"use client";

import Link from "next/link";
import { CheckCircle2, ClipboardList, PackageCheck, Trash2 } from "lucide-react";
import { memo, useState } from "react";
import ProgressRing from "./ProgressRing";

function OrderCard({ order, onDelete, compact = false }) {
  const [deleteOpen, setDeleteOpen] = useState(false);
  const totals = order.progress || {
    totalQuantity: order.items?.reduce((sum, item) => sum + item.quantity, 0) || 0,
    packedQuantity: order.items?.reduce((sum, item) => sum + item.packedQuantity, 0) || 0
  };
  const completed = order.packedStatus === "Completed" || order.packedStatus === "Packed";
  const statusLabel = completed ? "Completed" : order.packedStatus;
  const percent = totals.totalQuantity ? Math.min(100, Math.round((totals.packedQuantity / totals.totalQuantity) * 100)) : 0;

  function handleDelete() {
    setDeleteOpen(false);
    onDelete?.(order);
  }

  return (
    <>
      <article className={`rounded-lg border border-black/10 bg-white shadow-sm transition hover:-translate-y-0.5 hover:shadow-soft dark:border-white/10 dark:bg-[#151f1a] ${compact ? "p-2.5 sm:p-3" : "p-4"}`}>
        <div className={compact ? "flex items-start gap-2" : ""}>
        <Link href={`/orders/${order._id}`} className="block min-w-0 flex-1">
          <div className={`flex items-start justify-between gap-2 sm:gap-3 ${compact ? "mb-2" : "mb-4"}`}>
            <div className="min-w-0 flex-1">
              {!compact && <p className="text-xs uppercase tracking-wide text-black/45 dark:text-white/45">Invoice</p>}
              <h3 className={`${compact ? "text-sm" : "text-lg"} truncate font-bold leading-tight`}>{order.invoiceNo}</h3>
              <p className={`${compact ? "text-xs" : "mt-0.5 text-sm"} truncate text-black/60 dark:text-white/60`}>{order.customerName}</p>
            </div>
            <span className={`flex shrink-0 items-center gap-1 rounded-full px-1.5 py-0.5 text-[11px] font-semibold sm:px-2 sm:py-1 sm:text-xs ${completed ? "bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-100" : "bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-100"}`}>
              {completed ? <CheckCircle2 size={12} /> : <ClipboardList size={12} />}
              {statusLabel}
            </span>
          </div>
          {compact ? (
            <>
              <div className="mb-1.5 flex items-center justify-between gap-2 text-[11px] font-semibold text-black/60 dark:text-white/60">
                <span>{order.items?.length || 0} items</span>
                <span className="flex items-center gap-1">
                  <PackageCheck size={12} /> {totals.packedQuantity}/{totals.totalQuantity}
                </span>
              </div>
              <div className="h-1.5 overflow-hidden rounded-full bg-black/10 dark:bg-white/10">
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
          onClick={() => setDeleteOpen(true)}
          className={`${compact ? "grid h-9 w-9 shrink-0 place-items-center rounded-lg border border-red-200 text-red-700 transition hover:bg-red-50 dark:border-red-900/70 dark:text-red-300 dark:hover:bg-red-950/40" : "mt-4 flex min-h-11 w-full items-center justify-center gap-2 rounded-lg border border-red-200 px-3 py-2 text-sm font-semibold text-red-700 transition hover:bg-red-50 dark:border-red-900/70 dark:text-red-300 dark:hover:bg-red-950/40"}`}
          aria-label={`Move invoice ${order.invoiceNo} to trash`}
          title="Move to trash"
        >
          <Trash2 size={16} />
          {!compact && "Move to Trash"}
        </button>
        </div>
      </article>

      {deleteOpen && (
        <div className="fixed inset-0 z-50 grid place-items-end bg-black/45 p-3 sm:place-items-center">
          <div className="w-full max-w-md rounded-lg bg-white p-4 shadow-soft dark:bg-[#151f1a]">
            <div className="mb-4 flex items-start gap-3">
              <div className="grid h-10 w-10 shrink-0 place-items-center rounded-lg bg-red-100 text-red-700 dark:bg-red-950 dark:text-red-200">
                <Trash2 size={18} />
              </div>
              <div className="min-w-0 flex-1">
                <h2 className="text-lg font-black">Move to Trash</h2>
                <p className="mt-1 text-sm text-black/60 dark:text-white/60">
                  Move invoice <span className="font-bold text-black dark:text-white">{order.invoiceNo}</span> to trash? It will be permanently deleted after 24 hours.
                </p>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => setDeleteOpen(false)}
                className="min-h-11 rounded-lg border border-black/10 px-4 py-2 text-sm font-bold dark:border-white/10"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleDelete}
                className="flex min-h-11 items-center justify-center gap-2 rounded-lg bg-red-600 px-4 py-2 text-sm font-bold text-white"
              >
                <Trash2 size={16} />
                Move
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

export default memo(OrderCard);
