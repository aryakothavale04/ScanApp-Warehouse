"use client";

import Link from "next/link";
import { ArrowLeft, CheckCircle2, Loader2, Play, Plus, Save, Square, UserRound, X } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { api } from "@/src/lib/api";
import BarcodeScanner from "./BarcodeScanner";
import PackingChecklist from "./PackingChecklist";
import ProgressRing from "./ProgressRing";
import StoreBrand from "./StoreBrand";
import Toast from "./Toast";

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
  const [toast, setToast] = useState(null);
  const [lastPackedItemId, setLastPackedItemId] = useState(null);
  const [scanLoading, setScanLoading] = useState(false);
  const [partyName, setPartyName] = useState("");
  const [itemDraft, setItemDraft] = useState({ productName: "", hsnOrBarcode: "", quantity: 1, pricePerUnit: "" });
  const [savingParty, setSavingParty] = useState(false);
  const [addingItem, setAddingItem] = useState(false);
  const [addItemOpen, setAddItemOpen] = useState(false);
  const [partyNameOpen, setPartyNameOpen] = useState(false);
  const scanLoadingRef = useRef(false);
  const lastWrongScanRef = useRef({ value: "", at: 0 });

  const loadOrder = useCallback(async () => {
    setLoading(true);
    try {
      const data = await api.order(orderId);
      setOrder(data.order);
      setPartyName(data.order?.customerName || "");
    } catch (error) {
      setToast({ type: "error", message: error.message });
    } finally {
      setLoading(false);
    }
  }, [orderId]);

  useEffect(() => {
    loadOrder();
  }, [loadOrder]);

  const progress = useMemo(() => {
    if (!order) return { packedQuantity: 0, totalQuantity: 0 };
    return order.progress;
  }, [order]);

  const handleScan = useCallback(async (barcode) => {
    if (scanLoadingRef.current) return;
    scanLoadingRef.current = true;
    setScanLoading(true);
    try {
      const data = await api.scan(orderId, barcode);
      setOrder(data.order);
      setPartyName(data.order?.customerName || "");
      setLastPackedItemId(data.packedItem?.productId || data.packedItem?.hsnOrBarcode);
      setToast({ type: "success", message: data.message || "Item packed" });
      const completedQuantity = data.message === "Qty completed" || data.message === "Order completed";
      playScanSound(completedQuantity ? "complete" : "correct");
      window.navigator.vibrate?.(70);
      setTimeout(() => setLastPackedItemId(null), 900);
    } catch (error) {
      const now = Date.now();
      const scannedValue = barcode?.toString() || "";
      const isRepeatWrongScan = lastWrongScanRef.current.value === scannedValue && now - lastWrongScanRef.current.at < 2500;
      lastWrongScanRef.current = { value: scannedValue, at: now };

      setToast({ type: "error", message: error.message });
      if (!isRepeatWrongScan) {
        playScanSound("wrong");
        window.navigator.vibrate?.([80, 40, 80]);
      }
    } finally {
      scanLoadingRef.current = false;
      setScanLoading(false);
    }
  }, [orderId]);

  const handleUpdateItem = useCallback(async (itemIndex, item) => {
    const data = await api.updateOrderItem(orderId, itemIndex, item);
    setOrder(data.order);
    setPartyName(data.order?.customerName || "");
    setToast({ type: "success", message: data.message || "Item updated" });
  }, [orderId]);

  const handleManualPackItem = useCallback(async (itemIndex) => {
    const data = await api.manualPackOrderItem(orderId, itemIndex);
    setOrder(data.order);
    setPartyName(data.order?.customerName || "");
    setLastPackedItemId(data.packedItem?.productId || data.packedItem?.hsnOrBarcode);
    setToast({ type: "success", message: data.message || "Item packed" });
    playScanSound("correct");
    window.navigator.vibrate?.(70);
    setTimeout(() => setLastPackedItemId(null), 900);
  }, [orderId]);

  const handleRemovePackedItem = useCallback(async (itemIndex) => {
    const data = await api.removePackedOrderItem(orderId, itemIndex);
    setOrder(data.order);
    setPartyName(data.order?.customerName || "");
    setToast({ type: "success", message: data.message || "Packed item removed" });
  }, [orderId]);

  const handleSavePartyName = useCallback(async () => {
    setSavingParty(true);
    try {
      const data = await api.updateOrder(orderId, { customerName: partyName });
      setOrder(data.order);
      setPartyName(data.order?.customerName || "");
      setPartyNameOpen(false);
      setToast({ type: "success", message: data.message || "Party name updated" });
    } catch (error) {
      setToast({ type: "error", message: error.message });
    } finally {
      setSavingParty(false);
    }
  }, [orderId, partyName]);

  const handleAddItem = useCallback(async (event) => {
    event.preventDefault();
    setAddingItem(true);
    try {
      const data = await api.addOrderItem(orderId, itemDraft);
      setOrder(data.order);
      setPartyName(data.order?.customerName || "");
      setItemDraft({ productName: "", hsnOrBarcode: "", quantity: 1, pricePerUnit: "" });
      setAddItemOpen(false);
      setToast({ type: "success", message: data.message || "Item added" });
    } catch (error) {
      setToast({ type: "error", message: error.message });
    } finally {
      setAddingItem(false);
    }
  }, [itemDraft, orderId]);

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
        if (!scannerActive) armScanAudio();
        setScannerActive((value) => !value);
      }}
      className={`flex w-full items-center justify-center gap-2 rounded-lg px-4 py-3 font-bold text-white ${scannerActive ? "bg-red-600" : "bg-leaf"}`}
    >
      {scannerActive ? <Square size={18} /> : <Play size={18} />}
      {scannerActive ? "Stop Scanner" : "Start Scanner"}
    </button>
  );
  const partyButton = (
    <button
      type="button"
      onClick={() => setPartyNameOpen(true)}
      className="flex min-h-11 w-full items-center gap-3 rounded-lg bg-white px-4 py-3 text-left shadow-sm transition hover:bg-leaf/5 dark:bg-[#151f1a]"
    >
      <UserRound size={18} className="shrink-0 text-leaf" />
      <span className="min-w-0 flex-1">
        <span className="block text-xs font-semibold text-black/50 dark:text-white/50">Party Name</span>
        <span className="block truncate text-sm font-black">{order.customerName}</span>
      </span>
    </button>
  );
  const addItemButton = (
    <button
      type="button"
      onClick={() => setAddItemOpen(true)}
      className="flex min-h-11 w-full items-center justify-center gap-2 rounded-lg border border-leaf/30 bg-white px-4 py-2 text-sm font-bold text-leaf shadow-sm transition hover:bg-leaf/5 dark:bg-[#151f1a]"
    >
      <Plus size={17} />
      Add Item
    </button>
  );
  const scanner = scannerActive ? (
    <BarcodeScanner
      active={scannerActive}
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
      onRemovePacked={handleRemovePackedItem}
      onUpdateItem={handleUpdateItem}
      onError={(message) => setToast({ type: "error", message })}
      scanningMode={scannerActive}
    />
  );

  return (
    <main className="min-h-screen safe-bottom">
      <Toast toast={toast} onClose={() => setToast(null)} />
      <div className="mx-auto max-w-6xl px-4 py-4 sm:px-6 lg:px-8">
        <header className="mb-4 flex items-center justify-between gap-3">
          <Link href="/" className="grid h-10 w-10 place-items-center rounded-lg border border-black/10 bg-white dark:border-white/10 dark:bg-[#151f1a]" aria-label="Back">
            <ArrowLeft size={18} />
          </Link>
          <div className="min-w-0 flex-1">
            <StoreBrand compact />
            <p className="mt-1 truncate text-xs text-black/55 dark:text-white/55">
              {order.customerName} - Invoice {order.invoiceNo}
            </p>
          </div>
        </header>

        {packed && (
          <section className="mb-4 flex items-center gap-3 rounded-lg bg-emerald-600 p-4 text-white shadow-soft">
            <CheckCircle2 size={28} />
            <div>
              <p className="font-black">Order Completed</p>
              <p className="text-sm text-white/80">All items are packed and saved for history.</p>
            </div>
          </section>
        )}

        {scannerActive ? (
          <div className="space-y-4">
            <div className="space-y-3">
              {scanner}
              {scannerButton}
            </div>
            {checklist}
            <section className="grid gap-3 rounded-lg bg-white p-4 shadow-sm dark:bg-[#151f1a] sm:grid-cols-2">
              <div className="sm:col-span-2">
                <ProgressRing packed={progress.packedQuantity} total={progress.totalQuantity} />
              </div>
              {partyButton}
              {addItemButton}
            </section>
          </div>
        ) : (
          <div className="grid gap-5 lg:grid-cols-[420px_1fr]">
            <div className="space-y-4">
              <section className="rounded-lg bg-white p-4 shadow-sm dark:bg-[#151f1a]">
                <ProgressRing packed={progress.packedQuantity} total={progress.totalQuantity} />
                <div className="mt-4">
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
        <div className="fixed inset-0 z-50 grid place-items-end bg-black/45 p-3 sm:place-items-center">
          <form onSubmit={handleAddItem} className="w-full max-w-md rounded-lg bg-white p-4 shadow-soft dark:bg-[#151f1a]">
            <div className="mb-4 flex items-center justify-between gap-3">
              <div>
                <h2 className="text-lg font-black">Add Item</h2>
                <p className="text-xs text-black/55 dark:text-white/55">This item will appear in the checklist immediately.</p>
              </div>
              <button
                type="button"
                onClick={() => setAddItemOpen(false)}
                className="grid h-10 w-10 place-items-center rounded-lg border border-black/10 bg-white dark:border-white/10 dark:bg-[#101712]"
                aria-label="Close add item"
              >
                <X size={18} />
              </button>
            </div>

            <div className="grid gap-3">
              <label className="grid gap-1.5 text-sm font-bold">
                Item name
                <input
                  value={itemDraft.productName}
                  onChange={(event) => setItemDraft((current) => ({ ...current, productName: event.target.value }))}
                  className="rounded-lg border border-black/10 bg-white px-3 py-3 font-semibold outline-none focus:border-leaf dark:bg-[#101712]"
                  placeholder="Enter item name"
                  autoFocus
                />
              </label>
              <label className="grid gap-1.5 text-sm font-bold">
                Item code
                <input
                  value={itemDraft.hsnOrBarcode}
                  onChange={(event) => setItemDraft((current) => ({ ...current, hsnOrBarcode: event.target.value }))}
                  className="rounded-lg border border-black/10 bg-white px-3 py-3 font-semibold outline-none focus:border-leaf dark:bg-[#101712]"
                  placeholder="Barcode / item code optional"
                />
              </label>
              <div className="grid grid-cols-2 gap-3">
                <label className="grid gap-1.5 text-sm font-bold">
                  Qty
                  <input
                    type="number"
                    min="0.001"
                    step="0.001"
                    value={itemDraft.quantity}
                    onChange={(event) => setItemDraft((current) => ({ ...current, quantity: event.target.value }))}
                    className="rounded-lg border border-black/10 bg-white px-3 py-3 font-semibold outline-none focus:border-leaf dark:bg-[#101712]"
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
                    className="rounded-lg border border-black/10 bg-white px-3 py-3 font-semibold outline-none focus:border-leaf dark:bg-[#101712]"
                    placeholder="0"
                  />
                </label>
              </div>
            </div>

            <div className="mt-5 grid grid-cols-2 gap-2">
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
        <div className="fixed inset-0 z-50 grid place-items-end bg-black/45 p-3 sm:place-items-center">
          <form onSubmit={(event) => { event.preventDefault(); handleSavePartyName(); }} className="w-full max-w-md rounded-lg bg-white p-4 shadow-soft dark:bg-[#151f1a]">
            <div className="mb-4 flex items-center justify-between gap-3">
              <div>
                <h2 className="text-lg font-black">Change Party Name</h2>
                <p className="text-xs text-black/55 dark:text-white/55">This change will be saved to the order immediately.</p>
              </div>
              <button
                type="button"
                onClick={() => {
                  setPartyName(order.customerName || "");
                  setPartyNameOpen(false);
                }}
                className="grid h-10 w-10 place-items-center rounded-lg border border-black/10 bg-white dark:border-white/10 dark:bg-[#101712]"
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
                className="rounded-lg border border-black/10 bg-white px-3 py-3 font-semibold outline-none focus:border-leaf dark:bg-[#101712]"
                placeholder="Enter party name"
                autoFocus
              />
            </label>

            <div className="mt-5 grid grid-cols-2 gap-2">
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
