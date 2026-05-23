"use client";

import { Check, CheckCheck, Edit3, Loader2, Minus, PackageX, Plus, Save, Trash2, X } from "lucide-react";
import { memo, useMemo, useState } from "react";

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

function PackingChecklist({ items = [], lastPackedItemId, onManualPack, onManualPackFull, onRemoveOnePacked, onRemovePacked, onUpdateItem, onDeleteItem, onError, scanningMode = false }) {
  const [editingIndex, setEditingIndex] = useState(null);
  const [draft, setDraft] = useState(null);
  const [busyAction, setBusyAction] = useState(null);
  const [deleteTarget, setDeleteTarget] = useState(null);
  const missing = useMemo(() => items.filter((item) => (item?.packedQuantity || 0) < (item?.quantity || 0)), [items]);
  const visibleItems = useMemo(() => {
    const rows = items.map((item, index) => ({ item, index }));
    if (!scanningMode) return rows;
    return rows.sort((left, right) => {
      const leftDone = (left.item?.packedQuantity || 0) >= (left.item?.quantity || 0);
      const rightDone = (right.item?.packedQuantity || 0) >= (right.item?.quantity || 0);
      if (leftDone === rightDone) return left.index - right.index;
      return leftDone ? 1 : -1;
    });
  }, [items, scanningMode]);

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

  async function manualPackFull(index) {
    try {
      setBusyAction(`pack-full-${index}`);
      await onManualPackFull(index);
    } catch (error) {
      onError?.(error.message);
    } finally {
      setBusyAction(null);
    }
  }

  async function removePacked(index) {
    try {
      setBusyAction(`remove-${index}`);
      await onRemovePacked(index);
    } catch (error) {
      onError?.(error.message);
    } finally {
      setBusyAction(null);
    }
  }

  async function removeOnePacked(index) {
    try {
      setBusyAction(`remove-one-${index}`);
      await onRemoveOnePacked(index);
    } catch (error) {
      onError?.(error.message);
    } finally {
      setBusyAction(null);
    }
  }

  async function deleteItem() {
    if (!deleteTarget) return;
    try {
      setBusyAction(`delete-${deleteTarget.index}`);
      await onDeleteItem(deleteTarget.index);
      setDeleteTarget(null);
    } catch (error) {
      onError?.(error.message);
    } finally {
      setBusyAction(null);
    }
  }

  return (
    <section className="space-y-2.5 sm:space-y-4">
      {!scanningMode && (
      <div className="flex items-center justify-between">
        <h2 className="text-base font-bold sm:text-lg">Product Checklist</h2>
        <span className="rounded-full bg-black/5 px-2.5 py-0.5 text-[11px] font-semibold dark:bg-white/10 sm:px-3 sm:py-1 sm:text-xs">
          Missing {missing.length}
        </span>
      </div>
      )}

      <div className={scanningMode ? "grid gap-1.5 sm:gap-2" : "grid gap-2 sm:gap-3"}>
        {visibleItems.map(({ item = {}, index }) => {
          const done = (item.packedQuantity || 0) >= (item.quantity || 0);
          const activeKey = item.productId?._id || item.productId || item.hsnOrBarcode;
          const active = lastPackedItemId && String(lastPackedItemId) === String(activeKey);
          const barcodeLabel = getBarcodeLabel(item);
          const isEditing = editingIndex === index;
          const canManualPack = !done;
          const canRemoveOnePacked = (item.packedQuantity || 0) > 0;
          const actionButtonSize = scanningMode ? "h-7 w-7 sm:h-8 sm:w-8" : "h-9 w-9";
          const actionIconSize = scanningMode ? 14 : 16;

          return (
            <article
              key={`${item.productId?._id || item.productName}-${item.productName}-${index}`}
              className={`rounded-lg border shadow-sm transition ${scanningMode ? "p-2 sm:p-3" : "p-2.5 sm:p-4"} ${done ? "border-emerald-200 bg-emerald-50 dark:border-emerald-900 dark:bg-emerald-950/45" : "border-black/10 bg-white dark:border-white/10 dark:bg-[#151f1a]"} ${active ? "scan-success ring-2 ring-leaf" : ""}`}
            >
              <div className="flex items-start justify-between gap-2 sm:gap-3">
                <div className="min-w-0 flex-1">
                  {isEditing ? (
                    <div className="grid gap-1.5 sm:gap-2">
                      <input
                        value={draft.productName}
                        onChange={(event) => updateDraft("productName", event.target.value)}
                        className="w-full rounded-lg border border-black/10 bg-white px-2.5 py-2 text-sm font-semibold outline-none focus:border-leaf sm:px-3"
                        aria-label="Product name"
                      />
                      <input
                        value={draft.hsnOrBarcode}
                        onChange={(event) => updateDraft("hsnOrBarcode", event.target.value)}
                        className="w-full rounded-lg border border-black/10 bg-white px-2.5 py-2 text-sm outline-none focus:border-leaf sm:px-3"
                        placeholder="Barcode or Missing"
                        aria-label="HSN or barcode"
                      />
                    </div>
                  ) : (
                    <>
                      <h3 className={`flex items-start gap-1.5 font-bold leading-tight sm:gap-2 ${scanningMode ? "text-xs sm:text-sm" : "text-sm sm:text-base"}`}>
                        {item.serialNo ? (
                          <span className="shrink-0 text-black/45 dark:text-white/45">{item.serialNo}.</span>
                        ) : null}
                        <span className="min-w-0">{item.productName}</span>
                      </h3>
                      <p className={`mt-0.5 text-black/55 dark:text-white/55 sm:mt-1 ${scanningMode ? "text-[11px] sm:text-xs" : "text-xs sm:text-sm"}`}>
                        HSN / Barcode: {barcodeLabel}
                      </p>
                    </>
                  )}
                </div>
                <div className="flex shrink-0 items-center gap-1.5 sm:gap-2">
                  <>
                  {!scanningMode && (
                    <button
                      onClick={() => (isEditing ? cancelEditing() : startEditing(index, item))}
                      className="grid h-8 w-8 place-items-center rounded-lg border border-black/10 bg-white text-black/70 sm:h-10 sm:w-10"
                      aria-label={isEditing ? "Cancel edit" : "Edit item"}
                      title={isEditing ? "Cancel edit" : "Edit item"}
                    >
                      {isEditing ? <X size={18} /> : <Edit3 size={18} />}
                    </button>
                  )}
                    <button
                      type="button"
                      onClick={() => setDeleteTarget({ index, item })}
                      disabled={busyAction === `delete-${index}`}
                      className={`grid place-items-center border border-red-200 bg-white text-red-700 transition hover:bg-red-50 disabled:opacity-60 dark:border-red-900/70 dark:text-red-300 ${scanningMode ? "h-7 w-7 rounded-full sm:h-8 sm:w-8" : "h-8 w-8 rounded-lg sm:h-10 sm:w-10"}`}
                      aria-label={`Move ${item.productName || "product"} to trash`}
                      title="Move product to trash"
                    >
                      {busyAction === `delete-${index}` ? <Loader2 className="animate-spin" size={actionIconSize} /> : <Trash2 size={actionIconSize} />}
                    </button>
                  </>
                  <div className={`grid place-items-center rounded-full ${scanningMode ? "h-7 w-7 sm:h-8 sm:w-8" : "h-8 w-8 sm:h-10 sm:w-10"} ${done ? "bg-emerald-600 text-white" : "bg-black/5 text-black/40 dark:bg-white/10 dark:text-white/50"}`}>
                    {done ? <Check size={scanningMode ? 16 : 20} /> : <PackageX size={scanningMode ? 15 : 18} />}
                  </div>
                </div>
              </div>

              <div className={scanningMode ? "mt-1.5 sm:mt-2" : "mt-2.5 sm:mt-4"}>
                <div className={`${scanningMode ? "mb-1.5 grid-cols-3" : "mb-2 grid-cols-3 sm:mb-3"} grid gap-1.5 text-[11px] sm:gap-2 sm:text-xs`}>
                  <div className="rounded-lg bg-black/5 p-1.5 dark:bg-white/10 sm:p-2">
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
                  <div className="rounded-lg bg-black/5 p-1.5 dark:bg-white/10 sm:p-2">
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
                  <div className="rounded-lg bg-black/5 p-1.5 dark:bg-white/10 sm:p-2">
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

                {(isEditing || onManualPack || onRemoveOnePacked || onManualPackFull || onRemovePacked) && (
                  <div className={`${scanningMode ? "mb-1.5" : "mb-2 sm:mb-3"} flex items-center justify-between gap-2`}>
                    <div className="flex flex-wrap gap-1.5 sm:gap-2">
                    {isEditing && (
                      <button
                        onClick={() => saveItem(index)}
                        disabled={busyAction === `save-${index}`}
                        className="flex min-h-9 items-center gap-1.5 rounded-lg bg-leaf px-2.5 py-1.5 text-xs font-bold text-white disabled:opacity-60 sm:gap-2 sm:px-3 sm:py-2 sm:text-sm"
                      >
                        <Save size={16} />
                        Save item
                      </button>
                    )}
                      <button
                        type="button"
                        onClick={() => manualPackFull(index)}
                        disabled={!canManualPack}
                        className={`grid ${actionButtonSize} place-items-center rounded-lg bg-emerald-600 text-white shadow-sm transition disabled:opacity-35 ${scanningMode ? "rounded-full" : ""}`}
                        aria-label={`Mark full quantity packed for ${item.productName || "product"}`}
                        title="Full qty packed"
                      >
                        <CheckCheck size={actionIconSize} />
                      </button>
                      <button
                        type="button"
                        onClick={() => removePacked(index)}
                        disabled={!canRemoveOnePacked}
                        className={`grid ${actionButtonSize} place-items-center rounded-lg border border-red-200 bg-white text-red-700 shadow-sm transition disabled:opacity-35 ${scanningMode ? "rounded-full" : ""}`}
                        aria-label={`Reset packed quantity for ${item.productName || "product"}`}
                        title="Reset packed"
                      >
                        <X size={actionIconSize} />
                      </button>
                    </div>

                    <div className="flex flex-wrap justify-end gap-1.5 sm:gap-2">
                      <button
                        type="button"
                        onClick={() => removeOnePacked(index)}
                        disabled={!canRemoveOnePacked}
                        className={`grid ${actionButtonSize} place-items-center rounded-lg border border-red-200 bg-white text-red-700 shadow-sm transition disabled:opacity-35 ${scanningMode ? "rounded-full" : ""}`}
                        aria-label={`Remove one packed quantity from ${item.productName || "product"}`}
                        title="Unpack 1 qty"
                      >
                        <Minus size={actionIconSize} />
                      </button>
                      <button
                        type="button"
                        onClick={() => manualPack(index)}
                        disabled={!canManualPack}
                        className={`grid ${actionButtonSize} place-items-center rounded-lg bg-leaf text-white shadow-sm transition disabled:opacity-35 ${scanningMode ? "rounded-full" : ""}`}
                        aria-label={`Add one packed quantity for ${item.productName || "product"} manually`}
                        title="Only 1 qty packed"
                      >
                        <Plus size={actionIconSize} />
                      </button>
                    </div>
                  </div>
                )}

                <div className={`mb-1 flex justify-between font-semibold sm:mb-1.5 ${scanningMode ? "text-[11px] sm:text-xs" : "text-xs sm:text-sm"}`}>
                  <span>Packed</span>
                  <span>{item.packedQuantity}/{item.quantity}</span>
                </div>
                <div className={`${scanningMode ? "h-1.5 sm:h-2" : "h-2 sm:h-2.5"} overflow-hidden rounded-full bg-black/10 dark:bg-white/10`}>
                  <div
                    className={`h-full rounded-full transition-all duration-500 ${done ? "bg-emerald-600" : "bg-saffron"}`}
                    style={{ width: `${Math.min(100, ((item.packedQuantity || 0) / (item.quantity || 1)) * 100)}%` }}
                  />
                </div>
              </div>
            </article>
          );
        })}
      </div>
      {deleteTarget && (
        <div className="fixed inset-0 z-50 grid place-items-end bg-black/45 p-2.5 sm:place-items-center sm:p-3">
          <section className="w-full max-w-md rounded-lg bg-white p-3 shadow-soft dark:bg-[#151f1a] sm:p-4">
            <div className="mb-4 flex items-start gap-3">
              <div className="grid h-10 w-10 shrink-0 place-items-center rounded-lg bg-red-100 text-red-700 dark:bg-red-950 dark:text-red-200">
                <Trash2 size={18} />
              </div>
              <div className="min-w-0 flex-1">
                <h2 className="text-base font-black sm:text-lg">Move product to trash?</h2>
                <p className="mt-1 text-sm text-black/60 dark:text-white/60">
                  {deleteTarget.item?.productName || "This product"} will be removed from this order and permanently deleted after 24 hours.
                </p>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => setDeleteTarget(null)}
                disabled={busyAction === `delete-${deleteTarget.index}`}
                className="min-h-11 rounded-lg border border-black/10 px-4 py-2 text-sm font-bold dark:border-white/10"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={deleteItem}
                disabled={busyAction === `delete-${deleteTarget.index}`}
                className="flex min-h-11 items-center justify-center gap-2 rounded-lg bg-red-600 px-4 py-2 text-sm font-bold text-white disabled:opacity-60"
              >
                {busyAction === `delete-${deleteTarget.index}` ? <Loader2 className="animate-spin" size={16} /> : <Trash2 size={16} />}
                Move
              </button>
            </div>
          </section>
        </div>
      )}
    </section>
  );
}

export default memo(PackingChecklist);
