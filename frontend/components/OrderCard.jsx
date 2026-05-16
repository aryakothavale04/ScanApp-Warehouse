import Link from "next/link";
import { CheckCircle2, ClipboardList, PackageCheck } from "lucide-react";
import ProgressRing from "./ProgressRing";

export default function OrderCard({ order }) {
  const totals = order.progress || {
    totalQuantity: order.items?.reduce((sum, item) => sum + item.quantity, 0) || 0,
    packedQuantity: order.items?.reduce((sum, item) => sum + item.packedQuantity, 0) || 0
  };
  const packed = order.packedStatus === "Packed";

  return (
    <Link
      href={`/orders/${order._id}`}
      className="block rounded-lg border border-black/10 bg-white p-4 shadow-sm transition hover:-translate-y-0.5 hover:shadow-soft dark:border-white/10 dark:bg-[#151f1a]"
    >
      <div className="mb-4 flex items-start justify-between gap-3">
        <div>
          <p className="text-xs uppercase tracking-wide text-black/45 dark:text-white/45">Invoice</p>
          <h3 className="text-lg font-bold">{order.invoiceNo}</h3>
          <p className="mt-1 text-sm text-black/60 dark:text-white/60">{order.customerName}</p>
        </div>
        <span className={`flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-semibold ${packed ? "bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-100" : "bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-100"}`}>
          {packed ? <CheckCircle2 size={14} /> : <ClipboardList size={14} />}
          {order.packedStatus}
        </span>
      </div>
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
    </Link>
  );
}
