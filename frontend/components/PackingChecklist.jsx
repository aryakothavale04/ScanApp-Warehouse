"use client";

import { Check, PackageX } from "lucide-react";

export default function PackingChecklist({ items, lastPackedItemId }) {
  const missing = items.filter((item) => item.packedQuantity < item.quantity);

  return (
    <section className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-bold">Product Checklist</h2>
        <span className="rounded-full bg-black/5 px-3 py-1 text-xs font-semibold dark:bg-white/10">
          Missing {missing.length}
        </span>
      </div>

      <div className="grid gap-3">
        {items.map((item) => {
          const done = item.packedQuantity >= item.quantity;
          const activeKey = item.productId?._id || item.productId || item.hsnOrBarcode;
          const active = lastPackedItemId && String(lastPackedItemId) === String(activeKey);
          return (
            <article
              key={`${item.productId?._id || item.productName}-${item.productName}`}
              className={`rounded-lg border p-4 shadow-sm transition ${done ? "border-emerald-200 bg-emerald-50 dark:border-emerald-900 dark:bg-emerald-950/45" : "border-black/10 bg-white dark:border-white/10 dark:bg-[#151f1a]"} ${active ? "scan-success ring-2 ring-leaf" : ""}`}
            >
              <div className="flex items-start justify-between gap-3">
                <div>
                  <h3 className="font-bold leading-tight">{item.productName}</h3>
                  <p className="mt-1 text-sm text-black/55 dark:text-white/55">
                    HSN / Barcode: {item.productId?.barcode || item.hsnOrBarcode || "Not mapped"}
                  </p>
                </div>
                <div className={`grid h-10 w-10 shrink-0 place-items-center rounded-full ${done ? "bg-emerald-600 text-white" : "bg-black/5 text-black/40 dark:bg-white/10 dark:text-white/50"}`}>
                  {done ? <Check size={22} /> : <PackageX size={20} />}
                </div>
              </div>
              <div className="mt-4">
                <div className="mb-3 grid grid-cols-2 gap-2 text-xs sm:grid-cols-3">
                  <div className="rounded-lg bg-black/5 p-2 dark:bg-white/10">
                    <p className="text-black/50 dark:text-white/50">Qty</p>
                    <p className="font-bold">{item.quantity}</p>
                  </div>
                  <div className="rounded-lg bg-black/5 p-2 dark:bg-white/10">
                    <p className="text-black/50 dark:text-white/50">Price/unit</p>
                    <p className="font-bold">₹{item.pricePerUnit ?? 0}</p>
                  </div>
                  <div className="rounded-lg bg-black/5 p-2 dark:bg-white/10">
                    <p className="text-black/50 dark:text-white/50">Amount</p>
                    <p className="font-bold">₹{item.totalAmount ?? 0}</p>
                  </div>
                </div>
                <div className="mb-2 flex justify-between text-sm font-semibold">
                  <span>Packed</span>
                  <span>{item.packedQuantity}/{item.quantity}</span>
                </div>
                <div className="h-2.5 overflow-hidden rounded-full bg-black/10 dark:bg-white/10">
                  <div
                    className={`h-full rounded-full transition-all duration-500 ${done ? "bg-emerald-600" : "bg-saffron"}`}
                    style={{ width: `${Math.min(100, (item.packedQuantity / item.quantity) * 100)}%` }}
                  />
                </div>
              </div>
            </article>
          );
        })}
      </div>
    </section>
  );
}
