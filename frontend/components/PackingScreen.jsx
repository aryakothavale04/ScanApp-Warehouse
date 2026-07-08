"use client";

import { Barcode, Camera, CheckCircle2, ChevronDown, Download, Loader2, MapPin, Plus, Printer, Save, Share2, Square, Trash2, Truck, UserRound, X } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { api } from "@/src/lib/api";
import { downloadDeliveryChallanPdf, getDeliveryChallanSummary, openDeliveryChallanPrint, shareDeliveryChallanPdf } from "@/src/lib/slips";
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
  const [locationOpen, setLocationOpen] = useState(false);
  const [locationDraft, setLocationDraft] = useState({ type: "Loose Items", number: "" });
  const [savingLocation, setSavingLocation] = useState(false);
  const [deletingLocationId, setDeletingLocationId] = useState(null);
  const [challanPreviewOpen, setChallanPreviewOpen] = useState(false);
  const [challanAction, setChallanAction] = useState(null);
  const [locationPrompted, setLocationPrompted] = useState(false);
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

  const activePackingLocation = useMemo(() => {
    if (!order) return null;
    return (order.packingLocations || []).find((location) => String(location._id) === String(order.activePackingLocationId)) || order.packingLocations?.[0] || null;
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

  const handleManualPackLooseItem = useCallback(async (itemIndex) => {
    return enqueuePackingAction(async () => {
      const data = await api.manualPackLooseOrderItem(orderId, itemIndex);
      replaceOrder(data.order);
      setLastPackedItemId(data.packedItem?.productId || data.packedItem?.hsnOrBarcode);
      showToast({ type: "success", message: data.message || "Added to Loose Items" });
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

  const handleSelectPackingLocation = useCallback(async (locationId) => {
    setSavingLocation(true);
    try {
      const data = await api.selectPackingLocation(orderId, locationId);
      replaceOrder(data.order);
      setLocationOpen(false);
      showToast({ type: "success", message: data.message || "Packing location selected" });
    } catch (error) {
      showToast({ type: "error", message: error.message });
    } finally {
      setSavingLocation(false);
    }
  }, [orderId, replaceOrder, showToast]);

  const handleCreatePackingLocation = useCallback(async (event) => {
    event.preventDefault();
    setSavingLocation(true);
    try {
      const data = await api.createPackingLocation(orderId, locationDraft);
      replaceOrder(data.order);
      setLocationDraft({ type: "Loose Items", number: "" });
      setLocationOpen(false);
      showToast({ type: "success", message: data.message || "Packing location created" });
    } catch (error) {
      showToast({ type: "error", message: error.message });
    } finally {
      setSavingLocation(false);
    }
  }, [locationDraft, orderId, replaceOrder, showToast]);

  const handleDeletePackingLocation = useCallback(async (location) => {
    setDeletingLocationId(location._id);
    try {
      const data = await api.deletePackingLocation(orderId, location._id);
      replaceOrder(data.order);
      showToast({ type: "success", message: data.message || "Packing location deleted" });
    } catch (error) {
      showToast({ type: "error", message: error.message });
    } finally {
      setDeletingLocationId(null);
    }
  }, [orderId, replaceOrder, showToast]);

  const challanSummary = useMemo(() => order ? getDeliveryChallanSummary(order) : null, [order]);

  const handleDownloadDeliveryChallan = useCallback(async () => {
    setChallanAction("download");
    try {
      await downloadDeliveryChallanPdf(order);
      showToast({ type: "success", message: "Delivery challan downloaded" });
    } catch (error) {
      showToast({ type: "error", message: error.message || "Could not download delivery challan" });
    } finally {
      setChallanAction(null);
    }
  }, [order, showToast]);

  const handleShareDeliveryChallan = useCallback(async () => {
    setChallanAction("share");
    try {
      const shared = await shareDeliveryChallanPdf(order);
      showToast({ type: "success", message: shared ? "Delivery challan shared" : "Sharing is unavailable; PDF downloaded" });
    } catch (error) {
      showToast({ type: "error", message: error.message || "Could not share delivery challan" });
    } finally {
      setChallanAction(null);
    }
  }, [order, showToast]);

  const handlePrintDeliveryChallan = useCallback(() => {
    openDeliveryChallanPrint(order);
  }, [order]);

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
        if (!locationPrompted) {
          setLocationOpen(true);
          setLocationPrompted(true);
        }
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
  const locationButton = (
    <button
      type="button"
      onClick={() => setLocationOpen(true)}
      className="flex min-h-11 w-full items-center gap-2 rounded-lg bg-white px-3 py-2 text-left shadow-sm transition hover:bg-leaf/5 dark:bg-[#151f1a] sm:min-h-12 sm:px-4"
    >
      <MapPin size={18} className="shrink-0 text-leaf" />
      <span className="min-w-0 flex-1">
        <span className="block text-[11px] font-semibold text-black/50 dark:text-white/50 sm:text-xs">Active Packing Location</span>
        <span className="block max-w-full break-words text-sm font-black leading-snug sm:text-base">{activePackingLocation?.label || "Loose Items"}</span>
      </span>
      <ChevronDown size={17} className="shrink-0 text-black/45 dark:text-white/45" />
    </button>
  );
  const slipButtons = (
    <div>
      <button
        type="button"
        onClick={() => setChallanPreviewOpen(true)}
        className="flex min-h-11 w-full items-center justify-center gap-2 rounded-lg bg-leaf px-3 py-2 text-sm font-bold text-white shadow-sm disabled:opacity-60 sm:px-4"
      >
        <Truck size={16} />
        Delivery Challan
      </button>
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
      packingLocations={order.packingLocations || []}
      lastPackedItemId={lastPackedItemId}
      onManualPack={handleManualPackItem}
      onManualPackLoose={handleManualPackLooseItem}
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

        <div className="mb-2.5 grid gap-2 sm:mb-4 sm:grid-cols-[1fr_auto]">
          {locationButton}
          <div className="sm:min-w-[180px]">{slipButtons}</div>
        </div>

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
      {locationOpen && (
        <div className="fixed inset-0 z-50 grid place-items-end bg-black/45 p-2.5 sm:place-items-center sm:p-3">
          <section className="w-full max-w-md rounded-lg bg-white p-3 shadow-soft dark:bg-[#151f1a] sm:p-4">
            <div className="mb-3 flex items-center justify-between gap-3 sm:mb-4">
              <div>
              <h2 className="text-base font-black sm:text-lg">Packing / Delivery Location</h2>
                <p className="text-xs text-black/55 dark:text-white/55">Scanned items go to the active location.</p>
              </div>
              <button
                type="button"
                onClick={() => setLocationOpen(false)}
                className="grid h-9 w-9 place-items-center rounded-lg border border-black/10 bg-white dark:border-white/10 dark:bg-[#101712] sm:h-10 sm:w-10"
                aria-label="Close packing location"
              >
                <X size={18} />
              </button>
            </div>

            <div className="mb-4 grid gap-2">
              {(order.packingLocations || []).map((location) => {
                const selected = String(location._id) === String(order.activePackingLocationId);
                const deleting = deletingLocationId === location._id;
                return (
                  <div
                    key={location._id}
                    className={`grid grid-cols-[1fr_auto] items-stretch gap-1.5 rounded-lg border p-1.5 ${selected ? "border-leaf bg-leaf/10 text-leaf" : "border-black/10 bg-white dark:border-white/10 dark:bg-[#101712]"}`}
                  >
                    <button
                      type="button"
                      onClick={() => handleSelectPackingLocation(location._id)}
                      disabled={savingLocation || Boolean(deletingLocationId)}
                      className="flex min-h-10 min-w-0 items-center justify-between gap-2 rounded-md px-2 py-1.5 text-left text-sm font-bold disabled:opacity-60"
                    >
                      <span className="flex min-w-0 items-center gap-2">
                        <MapPin size={16} className="shrink-0" />
                        <span className="min-w-0 break-words leading-snug">{location.label}</span>
                      </span>
                      {selected ? <CheckCircle2 size={17} className="shrink-0" /> : null}
                    </button>
                    <button
                      type="button"
                      onClick={() => handleDeletePackingLocation(location)}
                      disabled={savingLocation || Boolean(deletingLocationId) || (order.packingLocations || []).length <= 1}
                      className="grid h-10 w-10 place-items-center rounded-md border border-red-200 bg-white text-red-700 disabled:opacity-40 dark:border-red-900/70 dark:bg-[#151f1a] dark:text-red-300"
                      aria-label={`Delete ${location.label}`}
                      title="Delete location"
                    >
                      {deleting ? <Loader2 className="animate-spin" size={15} /> : <Trash2 size={15} />}
                    </button>
                  </div>
                );
              })}
            </div>

            <form onSubmit={handleCreatePackingLocation} className="rounded-lg border border-black/10 p-2.5 dark:border-white/10 sm:p-3">
              <h3 className="mb-2 text-sm font-black">Create New Location</h3>
              <div className="grid gap-2 sm:grid-cols-[minmax(0,1fr)_112px]">
                <label className="grid min-w-0 gap-1 text-xs font-bold">
                  Type
                  <select
                    value={locationDraft.type}
                    onChange={(event) => setLocationDraft((current) => ({ ...current, type: event.target.value }))}
                    className="min-h-11 w-full min-w-0 rounded-lg border border-black/10 bg-white px-3 py-2 text-sm font-bold outline-none focus:border-leaf dark:bg-[#101712]"
                  >
                    <option>Tray</option>
                    <option>Box</option>
                    <option>Bag</option>
                    <option>Loose Items</option>
                  </select>
                </label>
                {locationDraft.type !== "Loose Items" && (
                  <label className="grid min-w-0 gap-1 text-xs font-bold">
                    Number
                    <input
                      type="number"
                      min="1"
                      step="1"
                      value={locationDraft.number}
                      onChange={(event) => setLocationDraft((current) => ({ ...current, number: event.target.value }))}
                      className="min-h-11 w-full min-w-0 rounded-lg border border-black/10 bg-white px-3 py-2 text-sm font-bold outline-none focus:border-leaf dark:bg-[#101712]"
                      placeholder="1"
                    />
                  </label>
                )}
              </div>
              <button
                type="submit"
                disabled={savingLocation}
                aria-busy={savingLocation ? "true" : undefined}
                className="mt-3 flex min-h-11 w-full items-center justify-center gap-2 rounded-lg bg-leaf px-4 py-2 text-sm font-bold text-white disabled:opacity-60"
              >
                {savingLocation ? <Loader2 className="animate-spin" size={16} /> : <Plus size={16} />}
                {savingLocation ? "Saving..." : "Create New Location"}
              </button>
            </form>
          </section>
        </div>
      )}
      {challanPreviewOpen && challanSummary && (
        <div className="fixed inset-0 z-50 grid place-items-end bg-black/45 p-2.5 sm:place-items-center sm:p-3">
          <section className="max-h-[92vh] w-full max-w-2xl overflow-auto rounded-lg bg-white p-3 shadow-soft dark:bg-[#151f1a] sm:p-4">
            <div className="mb-3 flex items-start justify-between gap-3">
              <div>
                <h2 className="text-base font-black sm:text-lg">Delivery Challan</h2>
                <p className="text-xs text-black/55 dark:text-white/55">Preview before sharing, downloading, or printing.</p>
              </div>
              <button
                type="button"
                onClick={() => setChallanPreviewOpen(false)}
                className="grid h-9 w-9 place-items-center rounded-lg border border-black/10 bg-white dark:border-white/10 dark:bg-[#101712] sm:h-10 sm:w-10"
                aria-label="Close delivery challan preview"
              >
                <X size={18} />
              </button>
            </div>

            <div className="rounded-lg border border-black/10 p-3 dark:border-white/10 sm:p-4">
              <div className="grid gap-2 text-sm sm:grid-cols-2">
                <p><span className="font-bold text-black/55 dark:text-white/55">Customer Name:</span> {challanSummary.customerName}</p>
                <p><span className="font-bold text-black/55 dark:text-white/55">Order Number:</span> {challanSummary.orderNumber}</p>
                <p><span className="font-bold text-black/55 dark:text-white/55">Contact Number:</span> {challanSummary.contact}</p>
                <p><span className="font-bold text-black/55 dark:text-white/55">Date:</span> {challanSummary.date}</p>
                <p className="sm:col-span-2"><span className="font-bold text-black/55 dark:text-white/55">Delivery Address:</span> {challanSummary.deliveryAddress}</p>
              </div>

              <h3 className="mt-4 text-sm font-black">Delivery Containers</h3>
              <div className="mt-2 overflow-hidden rounded-lg border border-black/10 dark:border-white/10">
                {(challanSummary.containers.length ? challanSummary.containers : [{ label: "No delivery containers assigned.", quantity: "-" }]).map((container) => (
                  <div key={container.label} className="grid grid-cols-[1fr_auto] gap-3 border-b border-black/10 px-3 py-2 text-sm last:border-b-0 dark:border-white/10">
                    <span className="font-semibold">{container.label}</span>
                    <span>{container.quantity}</span>
                  </div>
                ))}
              </div>

              <h3 className="mt-4 text-sm font-black">Loose Items</h3>
              <div className="mt-2 overflow-hidden rounded-lg border border-black/10 dark:border-white/10">
                {(challanSummary.looseItems.length ? challanSummary.looseItems : [{ label: "No loose items assigned.", quantity: "-" }]).map((item) => (
                  <div key={item.label} className="grid grid-cols-[1fr_auto] gap-3 border-b border-black/10 px-3 py-2 text-sm last:border-b-0 dark:border-white/10">
                    <span className="font-semibold">{item.label}</span>
                    <span>{item.quantity}</span>
                  </div>
                ))}
              </div>
            </div>

            <div className="mt-4 grid grid-cols-3 gap-2">
              <button
                type="button"
                onClick={handleShareDeliveryChallan}
                disabled={Boolean(challanAction)}
                className="flex min-h-11 items-center justify-center gap-2 rounded-lg border border-black/10 px-3 py-2 text-sm font-bold disabled:opacity-60 dark:border-white/10"
              >
                {challanAction === "share" ? <Loader2 className="animate-spin" size={16} /> : <Share2 size={16} />}
                Share
              </button>
              <button
                type="button"
                onClick={handleDownloadDeliveryChallan}
                disabled={Boolean(challanAction)}
                className="flex min-h-11 items-center justify-center gap-2 rounded-lg border border-black/10 px-3 py-2 text-sm font-bold disabled:opacity-60 dark:border-white/10"
              >
                {challanAction === "download" ? <Loader2 className="animate-spin" size={16} /> : <Download size={16} />}
                PDF
              </button>
              <button
                type="button"
                onClick={handlePrintDeliveryChallan}
                className="flex min-h-11 items-center justify-center gap-2 rounded-lg bg-leaf px-3 py-2 text-sm font-bold text-white"
              >
                <Printer size={16} />
                Print
              </button>
            </div>
          </section>
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
