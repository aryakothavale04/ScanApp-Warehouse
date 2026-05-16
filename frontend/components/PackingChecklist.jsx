"use client";

import { Check, Edit3, PackageCheck, PackageX, Save, X } from "lucide-react";
import { useState } from "react";

function getBarcodeLabel(item) {
  const barcode = item.productId?.barcode || item.hsnOrBarcode;
  const barcodeAsNumber = Number.parseFloat(barcode);
  const isQuantityValue = barcode && /^\d+(?:\.\d+)?$/.test(barcode) && Math.abs(barcodeAsNumber - item.quantity) < 0.001;
  return !barcode || isQuantityValue ? "Missing" : barcode;
}

function createDraft(item) {
  const barcodeLabel = getBarcodeLabel(item);
  return {
    productName: item.productName || "",
    hsnOrBarcode: barcodeLabel === "Missing" ? "" : item.productId?.barcode || item.hsnOrBarcode || "",
    quantity: item.quantity ?? 1,
    pricePerUnit: item.pricePerUnit ?? 0,
    totalAmount: item.totalAmount ?? 0
  };
}

export default function PackingChecklist({ items, lastPackedItemId, onManualPack, onUpdateItem, onError }) {
  const [editingIndex, setEditingIndex] = useState(null);
  const [draft, setDraft] = useState(null);
  const [busyAction, setBusyAction] = useState(null);
  const missing = items.filter((item) => item.packedQuantity < item.quantity);

  function startEditing(index, item) {
    setEditingIndex(index);
    setDraft(createDraft(item));
  }

  function cancelEditing() {
    setEditingIndex(null);
    setDraft(null);
  }

  function updateDraft(field, value) {
    setDraft((current) => ({ ...current, [field]: value }));
  }

  async function saveItem(index) {
    try {
      setBusyAction(`save-${index}`);
      await onUpdateItem(index, draft);
      cancelEditing();
    } catch (error) {
      onError?.(error.message);
    } finally {
      setBusyAction(null);
    }
  }

  async function manualPack(index) {
    try {
      setBusyAction(`pack-${index}`);
      await onManualPack(index);
    } catch (error) {
      onError?.(error.message);
    } finally {
      setBusyAction(null);
    }
  }

  return (
    <section className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-bold">Product Checklist</h2>
        <span className="rounded-full bg-black/5 px-3 py-1 text-xs font-semibold dark:bg-white/10">
          Missing {missing.length}
        </span>
      </div>

      <div className="grid gap-3">
        {items.map((item, index) => {
          const done = item.packedQuantity >= item.quantity;
          const activeKey = item.productId?._id || item.productId || item.hsnOrBarcode;
          const active = lastPackedItemId && String(lastPackedItemId) === String(activeKey);
          const barcodeLabel = getBarcodeLabel(item);
          const isEditing = editingIndex === index;
          const canManualPack = barcodeLabel === "Missing" && !done;

          return (
            <article
              key={`${item.productId?._id || item.productName}-${item.productName}-${index}`}
              className={`rounded-lg border p-4 shadow-sm transition ${done ? "border-emerald-200 bg-emerald-50 dark:border-emerald-900 dark:bg-emerald-950/45" : "border-black/10 bg-white dark:border-white/10 dark:bg-[#151f1a]"} ${active ? "scan-success ring-2 ring-leaf" : ""}`}
            >
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0 flex-1">
                  {isEditing ? (
                    <div className="grid gap-2">
                      <input
                        value={draft.productName}
                        onChange={(event) => updateDraft("productName", event.target.value)}
                        className="w-full rounded-lg border border-black/10 bg-white px-3 py-2 font-semibold outline-none focus:border-leaf"
                        aria-label="Product name"
                      />
                      <input
                        value={draft.hsnOrBarcode}
                        onChange={(event) => updateDraft("hsnOrBarcode", event.target.value)}
                        className="w-full rounded-lg border border-black/10 bg-white px-3 py-2 text-sm outline-none focus:border-leaf"
                        placeholder="Barcode or Missing"
                        aria-label="HSN or barcode"
                      />
                    </div>
                  ) : (
                    <>
                      <h3 className="font-bold leading-tight">{item.productName}</h3>
                      <p className="mt-1 text-sm text-black/55 dark:text-white/55">
                        HSN / Barcode: {barcodeLabel}
                      </p>
                    </>
                  )}
                </div>
                <div className="flex shrink-0 items-center gap-2">
                  <button
                    onClick={() => (isEditing ? cancelEditing() : startEditing(index, item))}
                    className="grid h-10 w-10 place-items-center rounded-lg border border-black/10 bg-white text-black/70"
                    aria-label={isEditing ? "Cancel edit" : "Edit item"}
                    title={isEditing ? "Cancel edit" : "Edit item"}
                  >
                    {isEditing ? <X size={18} /> : <Edit3 size={18} />}
                  </button>
                  <div className={`grid h-10 w-10 place-items-center rounded-full ${done ? "bg-emerald-600 text-white" : "bg-black/5 text-black/40 dark:bg-white/10 dark:text-white/50"}`}>
                    {done ? <Check size={22} /> : <PackageX size={20} />}
                  </div>
                </div>
              </div>

              <div className="mt-4">
                <div className="mb-3 grid grid-cols-2 gap-2 text-xs sm:grid-cols-3">
                  <div className="rounded-lg bg-black/5 p-2 dark:bg-white/10">
                    <p className="text-black/50 dark:text-white/50">Qty</p>
                    {isEditing ? (
                      <input
                        type="number"
                        min="0.001"
                        step="0.001"
                        value={draft.quantity}
                        onChange={(event) => updateDraft("quantity", event.target.value)}
                        className="mt-1 w-full rounded-md border border-black/10 bg-white px-2 py-1 font-bold outline-none focus:border-leaf"
                        aria-label="Quantity"
                      />
                    ) : (
                      <p className="font-bold">{item.quantity}</p>
                    )}
                  </div>
                  <div className="rounded-lg bg-black/5 p-2 dark:bg-white/10">
                    <p className="text-black/50 dark:text-white/50">Price/unit</p>
                    {isEditing ? (
                      <input
                        type="number"
                        min="0"
                        step="0.01"
                        value={draft.pricePerUnit}
                        onChange={(event) => updateDraft("pricePerUnit", event.target.value)}
                        className="mt-1 w-full rounded-md border border-black/10 bg-white px-2 py-1 font-bold outline-none focus:border-leaf"
                        aria-label="Price per unit"
                      />
                    ) : (
                      <p className="font-bold">Rs {item.pricePerUnit ?? 0}</p>
                    )}
                  </div>
                  <div className="rounded-lg bg-black/5 p-2 dark:bg-white/10">
                    <p className="text-black/50 dark:text-white/50">Amount</p>
                    {isEditing ? (
                      <input
                        type="number"
                        min="0"
                        step="0.01"
                        value={draft.totalAmount}
                        onChange={(event) => updateDraft("totalAmount", event.target.value)}
                        className="mt-1 w-full rounded-md border border-black/10 bg-white px-2 py-1 font-bold outline-none focus:border-leaf"
                        aria-label="Amount"
                      />
                    ) : (
                      <p className="font-bold">Rs {item.totalAmount ?? 0}</p>
                    )}
                  </div>
                </div>

                {(isEditing || canManualPack) && (
                  <div className="mb-3 flex flex-wrap gap-2">
                    {isEditing && (
                      <button
                        onClick={() => saveItem(index)}
                        disabled={busyAction === `save-${index}`}
                        className="flex items-center gap-2 rounded-lg bg-leaf px-3 py-2 text-sm font-bold text-white disabled:opacity-60"
                      >
                        <Save size={16} />
                        Save item
                      </button>
                    )}
                    {canManualPack && (
                      <button
                        onClick={() => manualPack(index)}
                        disabled={busyAction === `pack-${index}`}
                        className="flex items-center gap-2 rounded-lg bg-emerald-600 px-3 py-2 text-sm font-bold text-white disabled:opacity-60"
                      >
                        <PackageCheck size={16} />
                        Mark packed
                      </button>
                    )}
                  </div>
                )}

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
