"use client";

import { Barcode, Camera, CheckCircle2, Loader2, Plus, Save, Square, UserRound, X } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { api } from "@/src/lib/api";
import BarcodeScanner from "./BarcodeScanner";
import PackingChecklist from "./PackingChecklist";
import ProgressRing from "./ProgressRing";
import StoreBrand from "./StoreBrand";
import Toast from "./Toast";
import ToastHistoryButton from "./ToastHistoryButton";

let scanAudioContext;

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
  const [toastHistory, setToastHistory] = useState([]);
  const [lastPackedItemId, setLastPackedItemId] = useState(null);
  const [scanLoading, setScanLoading] = useState(false);
  const [partyName, setPartyName] = useState("");
  const [itemDraft, setItemDraft] = useState({ productName: "", hsnOrBarcode: "", quantity: 1, pricePerUnit: "" });
  const [savingParty, setSavingParty] = useState(false);
  const [addingItem, setAddingItem] = useState(false);
  const [addItemOpen, setAddItemOpen] = useState(false);
  const [partyNameOpen, setPartyNameOpen] = useState(false);
  const scanLoadingRef = useRef(false);
  const pendingScanQueueRef = useRef([]);
  const packingActionQueueRef = useRef(Promise.resolve());
  const hardwareScanBufferRef = useRef("");
  const hardwareScanTimerRef = useRef(null);
  const lastWrongScanRef = useRef({ value: "", at: 0 });

  const replaceOrder = useCallback((nextOrder) => {
    setOrder(nextOrder || null);
    if (nextOrder) setPartyName(nextOrder.customerName || "");
  }, []);

  const showToast = useCallback((nextToast) => {
    setToast(nextToast);
    if (!nextToast?.message) return;

    setToastHistory((current) => [
      {
        ...nextToast,
        id: `${Date.now()}-${current.length}`,
        time: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" })
      },
      ...current
    ].slice(0, 30));
  }, []);

  const showPackingError = useCallback((message) => {
    showToast({ type: "error", message });
    playScanSound("wrong");
    window.navigator.vibrate?.([80, 40, 80]);
  }, [showToast]);

  const loadOrder = useCallback(async () => {
    setLoading(true);
    try {
      const data = await api.order(orderId);
      replaceOrder(data.order);
    } catch (error) {
      showToast({ type: "error", message: error.message });
    } finally {
      setLoading(false);
    }
  }, [orderId, replaceOrder, showToast]);

  useEffect(() => {
    loadOrder();
  }, [loadOrder]);

  const progress = useMemo(() => {
    if (!order) return { packedQuantity: 0, totalQuantity: 0 };
    return order.progress;
  }, [order]);

  const handleScan = useCallback(async (barcode) => {
    if (scanLoadingRef.current) {
      if (pendingScanQueueRef.current.length < 20) {
        pendingScanQueueRef.current.push(barcode);
      }
      return;
    }

    scanLoadingRef.current = true;
    setScanLoading(true);

    let nextBarcode = barcode;
    try {
      while (nextBarcode) {
        try {
          const data = await api.scan(orderId, nextBarcode);
          replaceOrder(data.order);
          setLastPackedItemId(data.packedItem?.productId || data.packedItem?.hsnOrBarcode);
          showToast({ type: "success", message: data.message || "Item packed" });
          const completedQuantity = data.message === "Qty completed" || data.message === "Order completed";
          playScanSound(completedQuantity ? "complete" : "correct");
          window.navigator.vibrate?.(70);
          setTimeout(() => setLastPackedItemId(null), 900);
        } catch (error) {
          const now = Date.now();
          const scannedValue = nextBarcode?.toString() || "";
          const isRepeatWrongScan = lastWrongScanRef.current.value === scannedValue && now - lastWrongScanRef.current.at < 2500;
          lastWrongScanRef.current = { value: scannedValue, at: now };

          showToast({ type: "error", message: error.message });
          if (!isRepeatWrongScan) {
            playScanSound("wrong");
            window.navigator.vibrate?.([80, 40, 80]);
          }
        }

        nextBarcode = pendingScanQueueRef.current.shift();
      }
    } finally {
      scanLoadingRef.current = false;
      setScanLoading(false);
    }
  }, [orderId, replaceOrder, showToast]);

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

  const enqueuePackingAction = useCallback((action) => {
    const queuedAction = packingActionQueueRef.current.then(action, action);
    packingActionQueueRef.current = queuedAction.catch(() => {});
    return queuedAction;
  }, []);

  const handleUpdateItem = useCallback(async (itemIndex, item) => {
    const data = await api.updateOrderItem(orderId, itemIndex, item);
    replaceOrder(data.order);
    showToast({ type: "success", message: data.message || "Item updated" });
  }, [orderId, replaceOrder, showToast]);

  const handleManualPackItem = useCallback(async (itemIndex) => {
    return enqueuePackingAction(async () => {
      const data = await api.manualPackOrderItem(orderId, itemIndex);
      replaceOrder(data.order);
      setLastPackedItemId(data.packedItem?.productId || data.packedItem?.hsnOrBarcode);
      showToast({ type: "success", message: data.message || "Item packed" });
      playScanSound("correct");
      window.navigator.vibrate?.(70);
      setTimeout(() => setLastPackedItemId(null), 900);
    });
  }, [enqueuePackingAction, orderId, replaceOrder, showToast]);

  const handleManualPackFullItem = useCallback(async (itemIndex) => {
    return enqueuePackingAction(async () => {
      const data = await api.manualPackFullOrderItem(orderId, itemIndex);
      replaceOrder(data.order);
      setLastPackedItemId(data.packedItem?.productId || data.packedItem?.hsnOrBarcode);
      showToast({ type: "success", message: data.message || "Full quantity packed" });
      playScanSound("complete");
      window.navigator.vibrate?.([70, 40, 70]);
      setTimeout(() => setLastPackedItemId(null), 900);
    });
  }, [enqueuePackingAction, orderId, replaceOrder, showToast]);

  const handleRemovePackedItem = useCallback(async (itemIndex) => {
    return enqueuePackingAction(async () => {
      const data = await api.removePackedOrderItem(orderId, itemIndex);
      replaceOrder(data.order);
      showToast({ type: "success", message: data.message || "Packed item removed" });
    });
  }, [enqueuePackingAction, orderId, replaceOrder, showToast]);

  const handleRemoveOnePackedItem = useCallback(async (itemIndex) => {
    return enqueuePackingAction(async () => {
      const data = await api.removeOnePackedOrderItem(orderId, itemIndex);
      replaceOrder(data.order);
      showToast({ type: "success", message: data.message || "1 packed quantity removed" });
    });
  }, [enqueuePackingAction, orderId, replaceOrder, showToast]);

  const handleDeleteItem = useCallback(async (itemIndex) => {
    const data = await api.deleteOrderItem(orderId, itemIndex);
    replaceOrder(data.order);
    showToast({ type: "success", message: data.message || "Product moved to trash" });
  }, [orderId, replaceOrder, showToast]);

  const handleSavePartyName = useCallback(async () => {
    setSavingParty(true);
    try {
      const data = await api.updateOrder(orderId, { customerName: partyName });
      replaceOrder(data.order);
      setPartyNameOpen(false);
      showToast({ type: "success", message: data.message || "Party name updated" });
    } catch (error) {
      showToast({ type: "error", message: error.message });
    } finally {
      setSavingParty(false);
    }
  }, [orderId, partyName, replaceOrder, showToast]);

  const handleAddItem = useCallback(async (event) => {
    event.preventDefault();
    setAddingItem(true);
    try {
      const data = await api.addOrderItem(orderId, itemDraft);
      replaceOrder(data.order);
      setItemDraft({ productName: "", hsnOrBarcode: "", quantity: 1, pricePerUnit: "" });
      setAddItemOpen(false);
      showToast({ type: "success", message: data.message || "Item added" });
    } catch (error) {
      showToast({ type: "error", message: error.message });
    } finally {
      setAddingItem(false);
    }
  }, [itemDraft, orderId, replaceOrder, showToast]);

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
    <div className="flex items-center gap-2">
      <button
        type="button"
        onClick={() => setAddItemOpen(true)}
        className="flex min-h-10 flex-1 items-center justify-center gap-2 rounded-lg border border-leaf/30 bg-white px-3 py-2 text-sm font-bold text-leaf shadow-sm transition hover:bg-leaf/5 dark:bg-[#151f1a] sm:min-h-11 sm:px-4"
      >
        <Plus size={17} />
        Add Item
      </button>
      <ToastHistoryButton messages={toastHistory} />
    </div>
  );
  const scanner = scannerActive && cameraActive ? (
    <BarcodeScanner
      active={scannerActive && cameraActive}
      compact
      onScan={handleScan}
      onError={(message) => {
        showToast({ type: "error", message });
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
      onDeleteItem={handleDeleteItem}
      onError={showPackingError}
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
              <ToastHistoryButton messages={toastHistory} className="h-8 w-8 sm:h-9 sm:w-9" />
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
                <p className="text-xs text-black/55 dark:text-white/55">This item will be saved to the checklist.</p>
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
                aria-busy={addingItem ? "true" : undefined}
                className="flex min-h-11 items-center justify-center gap-2 rounded-lg bg-leaf px-4 py-2 text-sm font-bold text-white disabled:opacity-60"
              >
                {addingItem ? <Loader2 className="animate-spin" size={16} /> : <Plus size={16} />}
                {addingItem ? "Adding..." : "Add"}
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
                <p className="text-xs text-black/55 dark:text-white/55">This change will be saved to the order.</p>
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
                aria-busy={savingParty ? "true" : undefined}
                className="flex min-h-11 items-center justify-center gap-2 rounded-lg bg-leaf px-4 py-2 text-sm font-bold text-white disabled:opacity-60"
              >
                {savingParty ? <Loader2 className="animate-spin" size={16} /> : <Save size={16} />}
                {savingParty ? "Saving..." : "Save"}
              </button>
            </div>
          </form>
        </div>
      )}
    </main>
  );
}
