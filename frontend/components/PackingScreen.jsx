"use client";

import { Barcode, Camera, CheckCircle2, Loader2, Plus, Save, Square, UserRound, X } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { api } from "@/src/lib/api";
import BarcodeScanner from "./BarcodeScanner";
import PackingChecklist from "./PackingChecklist";
import ProgressRing from "./ProgressRing";
import StoreBrand from "./StoreBrand";
import Toast from "./Toast";

let scanAudioContext;
const SYNC_FAILED_MESSAGE = "Sync failed. Please retry.";
const SCAN_DEDUPE_WINDOW_MS = 350;

function toNumber(value, fallback = 0) {
  const number = Number.parseFloat(value);
  return Number.isFinite(number) ? number : fallback;
}

function normalizeLookupValue(value) {
  return String(value || "").trim().toLowerCase().replace(/[^a-z0-9]/g, "");
}

function getItemIdentity(item = {}) {
  return item.productId?._id || item.productId || item.hsnOrBarcode || item.productName || item.serialNo;
}

function getItemLookupValues(item = {}) {
  return [
    item.hsnOrBarcode,
    item.itemCode,
    item.barcode,
    item.productId?.barcode,
    item.productId?._id,
    item.productId,
    item.productName,
    item.itemName
  ].map(normalizeLookupValue).filter(Boolean);
}

function cloneOrder(order) {
  if (!order) return null;
  return {
    ...order,
    items: (order.items || []).map((item) => ({ ...item }))
  };
}

function recalculateOrder(order) {
  if (!order) return order;
  const items = order.items || [];
  const packedQuantity = items.reduce((sum, item) => sum + toNumber(item.packedQuantity), 0);
  const totalQuantity = items.reduce((sum, item) => sum + toNumber(item.quantity), 0);
  const completed = items.length > 0 && items.every((item) => toNumber(item.packedQuantity) >= toNumber(item.quantity));

  return {
    ...order,
    packedStatus: completed ? "Completed" : "Pending",
    progress: {
      ...(order.progress || {}),
      packedQuantity,
      totalQuantity
    }
  };
}

function updatePackedQuantity(order, itemIndex, updater) {
  const draft = cloneOrder(order);
  const item = draft?.items?.[itemIndex];
  if (!item) return draft;

  const quantity = Math.max(toNumber(item.quantity), 0);
  const currentPacked = Math.max(toNumber(item.packedQuantity), 0);
  item.packedQuantity = Math.min(quantity, Math.max(0, updater(currentPacked, quantity)));
  return recalculateOrder(draft);
}

function findScanItemIndex(order, barcode) {
  const normalizedBarcode = normalizeLookupValue(barcode);
  if (!normalizedBarcode) return -1;

  return (order?.items || []).findIndex((item) => {
    const values = getItemLookupValues(item);
    return values.some((value) => value === normalizedBarcode);
  });
}

function buildOptimisticItem(itemDraft, order) {
  const quantity = Math.max(toNumber(itemDraft.quantity, 1), 0);
  const pricePerUnit = Math.max(toNumber(itemDraft.pricePerUnit), 0);
  const serialNo = (order?.items || []).reduce((max, item, index) => {
    const serial = Number.parseInt(item.serialNo, 10);
    return Math.max(max, Number.isFinite(serial) ? serial : index + 1);
  }, 0) + 1;

  return {
    serialNo,
    productName: itemDraft.productName || "",
    hsnOrBarcode: itemDraft.hsnOrBarcode || "",
    quantity,
    pricePerUnit,
    totalAmount: quantity * pricePerUnit,
    packedQuantity: 0
  };
}

function getScanAudioContext() {
  if (typeof window === "undefined") return null;
  const AudioContext = window.AudioContext || window.webkitAudioContext;
  if (!AudioContext) return null;
  scanAudioContext ||= new AudioContext();
  return scanAudioContext;
}

function armScanAudio() {
  const audioContext = getScanAudioContext();
  audioContext?.resume?.();
}

function playTone(audioContext, { frequency, start, duration, type = "sine", gain = 0.28 }) {
  const oscillator = audioContext.createOscillator();
  const envelope = audioContext.createGain();

  oscillator.type = type;
  oscillator.frequency.setValueAtTime(frequency, start);
  envelope.gain.setValueAtTime(0.001, start);
  envelope.gain.exponentialRampToValueAtTime(gain, start + 0.006);
  envelope.gain.exponentialRampToValueAtTime(0.001, start + duration);

  oscillator.connect(envelope);
  envelope.connect(audioContext.destination);
  oscillator.start(start);
  oscillator.stop(start + duration + 0.02);
}

function playScanSound(result) {
  const audioContext = getScanAudioContext();
  if (!audioContext) return;

  audioContext.resume?.();
  const now = audioContext.currentTime;

  if (result === "correct") {
    playTone(audioContext, { frequency: 880, start: now, duration: 0.08, gain: 0.24 });
    playTone(audioContext, { frequency: 1320, start: now + 0.07, duration: 0.1, gain: 0.26 });
    return;
  }

  if (result === "complete") {
    playTone(audioContext, { frequency: 659.25, start: now, duration: 0.08, type: "triangle", gain: 0.24 });
    playTone(audioContext, { frequency: 880, start: now + 0.08, duration: 0.08, type: "triangle", gain: 0.25 });
    playTone(audioContext, { frequency: 1174.66, start: now + 0.16, duration: 0.14, type: "triangle", gain: 0.27 });
    return;
  }

  playTone(audioContext, { frequency: 220, start: now, duration: 0.16, type: "sawtooth", gain: 0.28 });
  playTone(audioContext, { frequency: 138.59, start: now + 0.13, duration: 0.2, type: "square", gain: 0.26 });
}

export default function PackingScreen({ orderId }) {
  const [order, setOrder] = useState(null);
  const [loading, setLoading] = useState(true);
  const [scannerActive, setScannerActive] = useState(false);
  const [cameraActive, setCameraActive] = useState(false);
  const [toast, setToast] = useState(null);
  const [lastPackedItemId, setLastPackedItemId] = useState(null);
  const [scanLoading, setScanLoading] = useState(false);
  const [partyName, setPartyName] = useState("");
  const [itemDraft, setItemDraft] = useState({ productName: "", hsnOrBarcode: "", quantity: 1, pricePerUnit: "" });
  const [savingParty, setSavingParty] = useState(false);
  const [addingItem, setAddingItem] = useState(false);
  const [addItemOpen, setAddItemOpen] = useState(false);
  const [partyNameOpen, setPartyNameOpen] = useState(false);
  const orderRef = useRef(null);
  const pendingSyncCountRef = useRef(0);
  const hardwareScanBufferRef = useRef("");
  const hardwareScanTimerRef = useRef(null);
  const lastScanRef = useRef({ value: "", at: 0 });
  const lastWrongScanRef = useRef({ value: "", at: 0 });

  const replaceOrder = useCallback((nextOrder) => {
    orderRef.current = nextOrder || null;
    setOrder(nextOrder || null);
    if (nextOrder) setPartyName(nextOrder.customerName || "");
  }, []);

  const applyOptimisticOrder = useCallback((updater) => {
    const previousOrder = orderRef.current;
    const nextOrder = recalculateOrder(updater(previousOrder));
    orderRef.current = nextOrder;
    setOrder(nextOrder);
    return previousOrder;
  }, []);

  const beginBackgroundSync = useCallback(() => {
    pendingSyncCountRef.current += 1;
    setScanLoading(true);
  }, []);

  const finishBackgroundSync = useCallback(() => {
    pendingSyncCountRef.current = Math.max(0, pendingSyncCountRef.current - 1);
    setScanLoading(pendingSyncCountRef.current > 0);
  }, []);

  const syncInBackground = useCallback((requestPromise, previousOrder, options = {}) => {
    beginBackgroundSync();
    Promise.resolve(requestPromise)
      .then((data) => {
        if (data?.order) replaceOrder(data.order);
        options.onSuccess?.(data);
      })
      .catch((error) => {
        if (previousOrder) replaceOrder(previousOrder);
        options.onError?.(error);
        setToast({ type: "error", message: SYNC_FAILED_MESSAGE });
      })
      .finally(finishBackgroundSync);
  }, [beginBackgroundSync, finishBackgroundSync, replaceOrder]);

  const loadOrder = useCallback(async () => {
    setLoading(true);
    try {
      const data = await api.order(orderId);
      replaceOrder(data.order);
    } catch (error) {
      setToast({ type: "error", message: error.message });
    } finally {
      setLoading(false);
    }
  }, [orderId, replaceOrder]);

  useEffect(() => {
    loadOrder();
  }, [loadOrder]);

  const progress = useMemo(() => {
    if (!order) return { packedQuantity: 0, totalQuantity: 0 };
    return order.progress;
  }, [order]);

  const handleScan = useCallback((barcode) => {
    const scannedValue = barcode?.toString() || "";
    const now = Date.now();
    if (lastScanRef.current.value === scannedValue && now - lastScanRef.current.at < SCAN_DEDUPE_WINDOW_MS) return;
    lastScanRef.current = { value: scannedValue, at: now };

    const previousOrder = orderRef.current;
    const itemIndex = findScanItemIndex(previousOrder, barcode);
    let optimisticOrder = previousOrder;

    if (itemIndex >= 0) {
      optimisticOrder = updatePackedQuantity(previousOrder, itemIndex, (currentPacked) => currentPacked + 1);
      replaceOrder(optimisticOrder);
      const packedItem = optimisticOrder?.items?.[itemIndex];
      const completedQuantity = toNumber(packedItem?.packedQuantity) >= toNumber(packedItem?.quantity);
      setLastPackedItemId(getItemIdentity(packedItem));
      setToast({ type: "success", message: completedQuantity ? "Qty completed" : "Item packed" });
      playScanSound(completedQuantity ? "complete" : "correct");
      window.navigator.vibrate?.(70);
      setTimeout(() => setLastPackedItemId(null), 900);
    }

    syncInBackground(api.scan(orderId, barcode), previousOrder, {
      onSuccess: (data) => {
        const packedItemId = data?.packedItem?.productId || data?.packedItem?.hsnOrBarcode;
        if (packedItemId) {
          setLastPackedItemId(packedItemId);
          setTimeout(() => setLastPackedItemId(null), 900);
        }
        if (itemIndex < 0) {
          setToast({ type: "success", message: data?.message || "Item packed" });
          const completedQuantity = data?.message === "Qty completed" || data?.message === "Order completed";
          playScanSound(completedQuantity ? "complete" : "correct");
          window.navigator.vibrate?.(70);
        }
      },
      onError: () => {
        if (itemIndex >= 0) return;
        const retryAt = Date.now();
        const isRepeatWrongScan = lastWrongScanRef.current.value === scannedValue && retryAt - lastWrongScanRef.current.at < 2500;
        lastWrongScanRef.current = { value: scannedValue, at: retryAt };
        if (!isRepeatWrongScan) {
          playScanSound("wrong");
          window.navigator.vibrate?.([80, 40, 80]);
        }
      }
    });
  }, [orderId, replaceOrder, syncInBackground]);

  useEffect(() => {
    if (!scannerActive) return undefined;

    function clearHardwareScanTimer() {
      if (!hardwareScanTimerRef.current) return;
      window.clearTimeout(hardwareScanTimerRef.current);
      hardwareScanTimerRef.current = null;
    }

    function submitHardwareScan() {
      const barcode = hardwareScanBufferRef.current.trim();
      hardwareScanBufferRef.current = "";
      clearHardwareScanTimer();
      if (barcode.length < 2) return;
      handleScan(barcode);
    }

    function handleHardwareScannerKeydown(event) {
      const target = event.target;
      const isEditableTarget = target?.isContentEditable || ["INPUT", "TEXTAREA", "SELECT"].includes(target?.tagName);
      if (isEditableTarget || event.ctrlKey || event.altKey || event.metaKey) return;

      if (event.key === "Enter" || event.key === "Tab") {
        event.preventDefault();
        submitHardwareScan();
        return;
      }

      if (event.key.length !== 1) return;

      hardwareScanBufferRef.current += event.key;
      clearHardwareScanTimer();
      hardwareScanTimerRef.current = window.setTimeout(() => {
        if (hardwareScanBufferRef.current.trim().length >= 4) submitHardwareScan();
        else hardwareScanBufferRef.current = "";
      }, 120);
    }

    window.addEventListener("keydown", handleHardwareScannerKeydown);
    return () => {
      window.removeEventListener("keydown", handleHardwareScannerKeydown);
      hardwareScanBufferRef.current = "";
      clearHardwareScanTimer();
    };
  }, [handleScan, scannerActive]);

  const handleUpdateItem = useCallback((itemIndex, item) => {
    const previousOrder = applyOptimisticOrder((currentOrder) => {
      const draft = cloneOrder(currentOrder);
      if (draft?.items?.[itemIndex]) {
        const quantity = Math.max(toNumber(item.quantity, 1), 0);
        const pricePerUnit = Math.max(toNumber(item.pricePerUnit), 0);
        draft.items[itemIndex] = {
          ...draft.items[itemIndex],
          ...item,
          quantity,
          pricePerUnit,
          totalAmount: toNumber(item.totalAmount, quantity * pricePerUnit),
          packedQuantity: Math.min(toNumber(draft.items[itemIndex].packedQuantity), quantity)
        };
      }
      return draft;
    });
    setToast({ type: "success", message: "Item updated" });
    syncInBackground(api.updateOrderItem(orderId, itemIndex, item), previousOrder);
  }, [applyOptimisticOrder, orderId, syncInBackground]);

  const handleManualPackItem = useCallback((itemIndex) => {
    const previousOrder = orderRef.current;
    const optimisticOrder = updatePackedQuantity(previousOrder, itemIndex, (currentPacked) => currentPacked + 1);
    replaceOrder(optimisticOrder);
    const packedItem = optimisticOrder?.items?.[itemIndex];
    setLastPackedItemId(getItemIdentity(packedItem));
    setToast({ type: "success", message: "Item packed" });
    playScanSound("correct");
    window.navigator.vibrate?.(70);
    setTimeout(() => setLastPackedItemId(null), 900);
    syncInBackground(api.manualPackOrderItem(orderId, itemIndex), previousOrder);
  }, [orderId, replaceOrder, syncInBackground]);

  const handleManualPackFullItem = useCallback((itemIndex) => {
    const previousOrder = orderRef.current;
    const optimisticOrder = updatePackedQuantity(previousOrder, itemIndex, (_currentPacked, quantity) => quantity);
    replaceOrder(optimisticOrder);
    const packedItem = optimisticOrder?.items?.[itemIndex];
    setLastPackedItemId(getItemIdentity(packedItem));
    setToast({ type: "success", message: "Full quantity packed" });
    playScanSound("complete");
    window.navigator.vibrate?.([70, 40, 70]);
    setTimeout(() => setLastPackedItemId(null), 900);
    syncInBackground(api.manualPackFullOrderItem(orderId, itemIndex), previousOrder);
  }, [orderId, replaceOrder, syncInBackground]);

  const handleRemovePackedItem = useCallback((itemIndex) => {
    const previousOrder = orderRef.current;
    const optimisticOrder = updatePackedQuantity(previousOrder, itemIndex, () => 0);
    replaceOrder(optimisticOrder);
    setToast({ type: "success", message: "Packed item removed" });
    syncInBackground(api.removePackedOrderItem(orderId, itemIndex), previousOrder);
  }, [orderId, replaceOrder, syncInBackground]);

  const handleRemoveOnePackedItem = useCallback((itemIndex) => {
    const previousOrder = orderRef.current;
    const optimisticOrder = updatePackedQuantity(previousOrder, itemIndex, (currentPacked) => currentPacked - 1);
    replaceOrder(optimisticOrder);
    setToast({ type: "success", message: "1 packed quantity removed" });
    syncInBackground(api.removeOnePackedOrderItem(orderId, itemIndex), previousOrder);
  }, [orderId, replaceOrder, syncInBackground]);

  const handleSavePartyName = useCallback(() => {
    const previousOrder = applyOptimisticOrder((currentOrder) => ({ ...currentOrder, customerName: partyName }));
    setSavingParty(true);
    setPartyNameOpen(false);
    setToast({ type: "success", message: "Party name updated" });
    syncInBackground(api.updateOrder(orderId, { customerName: partyName }), previousOrder, {
      onError: () => setPartyName(previousOrder?.customerName || ""),
      onSuccess: () => setSavingParty(false)
    });
    window.setTimeout(() => setSavingParty(false), 0);
  }, [applyOptimisticOrder, orderId, partyName, syncInBackground]);

  const handleAddItem = useCallback((event) => {
    event.preventDefault();
    const previousOrder = applyOptimisticOrder((currentOrder) => {
      const draft = cloneOrder(currentOrder);
      return {
        ...draft,
        items: [...(draft?.items || []), buildOptimisticItem(itemDraft, draft)]
      };
    });
    setAddingItem(true);
    setItemDraft({ productName: "", hsnOrBarcode: "", quantity: 1, pricePerUnit: "" });
    setAddItemOpen(false);
    setToast({ type: "success", message: "Item added" });
    syncInBackground(api.addOrderItem(orderId, itemDraft), previousOrder, {
      onSuccess: () => setAddingItem(false),
      onError: () => setAddingItem(false)
    });
    window.setTimeout(() => setAddingItem(false), 0);
  }, [applyOptimisticOrder, itemDraft, orderId, syncInBackground]);

  if (loading) {
    return (
      <main className="grid min-h-screen place-items-center">
        <Loader2 className="animate-spin text-leaf" size={34} />
      </main>
    );
  }

  if (!order) {
    return (
      <main className="grid min-h-screen place-items-center p-4 text-center">
        <p>Order not found.</p>
      </main>
    );
  }

  const packed = order.packedStatus === "Completed" || order.packedStatus === "Packed";
  const scannerButton = (
    <button
      onClick={() => {
        armScanAudio();
        setScannerActive(true);
        setCameraActive(false);
      }}
      className="flex min-h-10 w-full items-center justify-center gap-2 rounded-lg bg-leaf px-3 py-2 text-sm font-bold text-white sm:min-h-12 sm:px-4 sm:py-3 sm:text-base"
    >
      <Barcode size={18} />
      Start Barcode Scanner
    </button>
  );
  const partyButton = (
    <button
      type="button"
      onClick={() => setPartyNameOpen(true)}
      className="flex min-h-10 w-full items-center gap-2 rounded-lg bg-white px-3 py-2 text-left shadow-sm transition hover:bg-leaf/5 dark:bg-[#151f1a] sm:min-h-11 sm:gap-3 sm:px-4 sm:py-3"
    >
      <UserRound size={18} className="shrink-0 text-leaf" />
      <span className="min-w-0 flex-1">
        <span className="block text-[11px] font-semibold text-black/50 dark:text-white/50 sm:text-xs">Party Name</span>
        <span className="block truncate text-xs font-black sm:text-sm">{order.customerName}</span>
      </span>
    </button>
  );
  const addItemButton = (
    <button
      type="button"
      onClick={() => setAddItemOpen(true)}
      className="flex min-h-10 w-full items-center justify-center gap-2 rounded-lg border border-leaf/30 bg-white px-3 py-2 text-sm font-bold text-leaf shadow-sm transition hover:bg-leaf/5 dark:bg-[#151f1a] sm:min-h-11 sm:px-4"
    >
      <Plus size={17} />
      Add Item
    </button>
  );
  const scanner = scannerActive && cameraActive ? (
    <BarcodeScanner
      active={scannerActive && cameraActive}
      compact
      onScan={handleScan}
      onError={(message) => {
        setToast({ type: "error", message });
        playScanSound("wrong");
      }}
    />
  ) : null;
  const checklist = (
    <PackingChecklist
      items={order.items}
      lastPackedItemId={lastPackedItemId}
      onManualPack={handleManualPackItem}
      onManualPackFull={handleManualPackFullItem}
      onRemoveOnePacked={handleRemoveOnePackedItem}
      onRemovePacked={handleRemovePackedItem}
      onUpdateItem={handleUpdateItem}
      onError={(message) => setToast({ type: "error", message })}
      scanningMode={scannerActive}
    />
  );

  return (
    <main className="min-h-screen safe-bottom">
      <Toast toast={toast} onClose={() => setToast(null)} />
      <div className="mx-auto max-w-6xl px-2.5 py-2.5 sm:px-6 sm:py-4 lg:px-8">
        <header className={scannerActive ? "mb-1.5 flex items-center justify-between gap-2" : "-mx-2.5 mb-3 grid gap-1 border-b border-black/5 bg-limewash/95 px-2.5 py-2 backdrop-blur dark:border-white/5 dark:bg-[#101714]/95 sm:static sm:mx-0 sm:mb-4 sm:border-0 sm:bg-transparent sm:px-0 sm:py-0 sm:backdrop-blur-none"}>
          {scannerActive ? (
            <>
              <p className="min-w-0 flex-1 truncate text-xs font-bold text-black/70 dark:text-white/70">
                {order.customerName} - Invoice {order.invoiceNo}
              </p>
              {scanLoading && <Loader2 className="shrink-0 animate-spin text-leaf" size={15} aria-label="Syncing" />}
              <button
                type="button"
                onClick={() => {
                  armScanAudio();
                  setCameraActive((value) => !value);
                }}
                className={`grid h-8 w-8 shrink-0 place-items-center rounded-lg text-white shadow-sm sm:h-9 sm:w-9 ${cameraActive ? "bg-amber-600" : "bg-leaf"}`}
                aria-label={cameraActive ? "Stop camera scanner" : "Start camera scanner"}
                title={cameraActive ? "Stop camera" : "Start camera"}
              >
                {cameraActive ? <Square size={15} /> : <Camera size={15} />}
              </button>
              <button
                onClick={() => {
                  setScannerActive(false);
                  setCameraActive(false);
                }}
                className="flex min-h-8 shrink-0 items-center justify-center gap-1 rounded-lg bg-red-600 px-2.5 py-1 text-xs font-bold text-white sm:min-h-9 sm:gap-1.5 sm:px-3 sm:py-1.5 sm:text-sm"
              >
                <Square size={15} />
                Stop
              </button>
            </>
          ) : (
            <div className="min-w-0 flex-1">
              <StoreBrand />
              <p className="mt-0.5 truncate text-xs text-black/55 dark:text-white/55 sm:mt-1">
                {order.customerName} - Invoice {order.invoiceNo}
              </p>
            </div>
          )}
        </header>

        {packed && (
          <section className="mb-2.5 flex items-center gap-2 rounded-lg bg-emerald-600 p-2.5 text-white shadow-sm sm:mb-4 sm:gap-3 sm:p-4 sm:shadow-soft">
            <CheckCircle2 size={22} />
            <div>
              <p className="text-sm font-black sm:text-base">Order Completed</p>
              <p className="text-xs text-white/80 sm:text-sm">All items are packed and saved for history.</p>
            </div>
          </section>
        )}

        {scannerActive ? (
          <div className="space-y-2">
            <div className={cameraActive ? "grid gap-2 lg:grid-cols-[240px_1fr] lg:items-start" : "grid gap-2"}>
              {cameraActive && (
                <div className="mx-auto w-full max-w-[220px] sm:max-w-[260px] lg:sticky lg:top-3">
                  {scanner}
                </div>
              )}
              {checklist}
            </div>
            <section className="rounded-lg bg-white p-2.5 shadow-sm dark:bg-[#151f1a] sm:p-4">
              <ProgressRing packed={progress.packedQuantity} total={progress.totalQuantity} />
            </section>
          </div>
        ) : (
          <div className="grid gap-3 lg:grid-cols-[340px_1fr] lg:gap-5">
            <div className="space-y-2.5 sm:space-y-4">
              <section className="rounded-lg bg-white p-2.5 shadow-sm dark:bg-[#151f1a] sm:p-4">
                <ProgressRing packed={progress.packedQuantity} total={progress.totalQuantity} />
                <div className="mt-2.5 sm:mt-4">
                  {scannerButton}
                </div>
              </section>
              {partyButton}
              {addItemButton}
            </div>

            {checklist}
          </div>
        )}
      </div>
      {addItemOpen && (
        <div className="fixed inset-0 z-50 grid place-items-end bg-black/45 p-2.5 sm:place-items-center sm:p-3">
          <form onSubmit={handleAddItem} className="w-full max-w-md rounded-lg bg-white p-3 shadow-soft dark:bg-[#151f1a] sm:p-4">
            <div className="mb-3 flex items-center justify-between gap-3 sm:mb-4">
              <div>
                <h2 className="text-base font-black sm:text-lg">Add Item</h2>
                <p className="text-xs text-black/55 dark:text-white/55">This item will appear in the checklist immediately.</p>
              </div>
              <button
                type="button"
                onClick={() => setAddItemOpen(false)}
                className="grid h-9 w-9 place-items-center rounded-lg border border-black/10 bg-white dark:border-white/10 dark:bg-[#101712] sm:h-10 sm:w-10"
                aria-label="Close add item"
              >
                <X size={18} />
              </button>
            </div>

            <div className="grid gap-2.5 sm:gap-3">
              <label className="grid gap-1.5 text-sm font-bold">
                Item name
                <input
                  value={itemDraft.productName}
                  onChange={(event) => setItemDraft((current) => ({ ...current, productName: event.target.value }))}
                  className="rounded-lg border border-black/10 bg-white px-3 py-2.5 font-semibold outline-none focus:border-leaf dark:bg-[#101712] sm:py-3"
                  placeholder="Enter item name"
                  autoFocus
                />
              </label>
              <label className="grid gap-1.5 text-sm font-bold">
                Item code
                <input
                  value={itemDraft.hsnOrBarcode}
                  onChange={(event) => setItemDraft((current) => ({ ...current, hsnOrBarcode: event.target.value }))}
                  className="rounded-lg border border-black/10 bg-white px-3 py-2.5 font-semibold outline-none focus:border-leaf dark:bg-[#101712] sm:py-3"
                  placeholder="Barcode / item code optional"
                />
              </label>
              <div className="grid grid-cols-2 gap-2.5 sm:gap-3">
                <label className="grid gap-1.5 text-sm font-bold">
                  Qty
                  <input
                    type="number"
                    min="0.001"
                    step="0.001"
                    value={itemDraft.quantity}
                    onChange={(event) => setItemDraft((current) => ({ ...current, quantity: event.target.value }))}
                    className="rounded-lg border border-black/10 bg-white px-3 py-2.5 font-semibold outline-none focus:border-leaf dark:bg-[#101712] sm:py-3"
                  />
                </label>
                <label className="grid gap-1.5 text-sm font-bold">
                  Price/unit
                  <input
                    type="number"
                    min="0"
                    step="0.01"
                    value={itemDraft.pricePerUnit}
                    onChange={(event) => setItemDraft((current) => ({ ...current, pricePerUnit: event.target.value }))}
                    className="rounded-lg border border-black/10 bg-white px-3 py-2.5 font-semibold outline-none focus:border-leaf dark:bg-[#101712] sm:py-3"
                    placeholder="0"
                  />
                </label>
              </div>
            </div>

            <div className="mt-4 grid grid-cols-2 gap-2 sm:mt-5">
              <button
                type="button"
                onClick={() => setAddItemOpen(false)}
                className="min-h-11 rounded-lg border border-black/10 px-4 py-2 text-sm font-bold dark:border-white/10"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={addingItem}
                className="flex min-h-11 items-center justify-center gap-2 rounded-lg bg-leaf px-4 py-2 text-sm font-bold text-white disabled:opacity-60"
              >
                {addingItem ? <Loader2 className="animate-spin" size={16} /> : <Plus size={16} />}
                Add
              </button>
            </div>
          </form>
        </div>
      )}
      {partyNameOpen && (
        <div className="fixed inset-0 z-50 grid place-items-end bg-black/45 p-2.5 sm:place-items-center sm:p-3">
          <form onSubmit={(event) => { event.preventDefault(); handleSavePartyName(); }} className="w-full max-w-md rounded-lg bg-white p-3 shadow-soft dark:bg-[#151f1a] sm:p-4">
            <div className="mb-3 flex items-center justify-between gap-3 sm:mb-4">
              <div>
                <h2 className="text-base font-black sm:text-lg">Change Party Name</h2>
                <p className="text-xs text-black/55 dark:text-white/55">This change will be saved to the order immediately.</p>
              </div>
              <button
                type="button"
                onClick={() => {
                  setPartyName(order.customerName || "");
                  setPartyNameOpen(false);
                }}
                className="grid h-9 w-9 place-items-center rounded-lg border border-black/10 bg-white dark:border-white/10 dark:bg-[#101712] sm:h-10 sm:w-10"
                aria-label="Close party name editor"
              >
                <X size={18} />
              </button>
            </div>

            <label className="grid gap-1.5 text-sm font-bold">
              Party name
              <input
                value={partyName}
                onChange={(event) => setPartyName(event.target.value)}
                className="rounded-lg border border-black/10 bg-white px-3 py-2.5 font-semibold outline-none focus:border-leaf dark:bg-[#101712] sm:py-3"
                placeholder="Enter party name"
                autoFocus
              />
            </label>

            <div className="mt-4 grid grid-cols-2 gap-2 sm:mt-5">
              <button
                type="button"
                onClick={() => {
                  setPartyName(order.customerName || "");
                  setPartyNameOpen(false);
                }}
                disabled={savingParty}
                className="min-h-11 rounded-lg border border-black/10 px-4 py-2 text-sm font-bold dark:border-white/10"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={savingParty}
                className="flex min-h-11 items-center justify-center gap-2 rounded-lg bg-leaf px-4 py-2 text-sm font-bold text-white disabled:opacity-60"
              >
                {savingParty ? <Loader2 className="animate-spin" size={16} /> : <Save size={16} />}
                Save
              </button>
            </div>
          </form>
        </div>
      )}
    </main>
  );
}
