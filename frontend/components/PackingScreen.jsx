"use client";

import Link from "next/link";
import { ArrowLeft, CheckCircle2, Loader2, Play, Square } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { api } from "@/lib/api";
import BarcodeScanner from "./BarcodeScanner";
import PackingChecklist from "./PackingChecklist";
import ProgressRing from "./ProgressRing";
import ThemeToggle from "./ThemeToggle";
import Toast from "./Toast";

export default function PackingScreen({ orderId }) {
  const [order, setOrder] = useState(null);
  const [loading, setLoading] = useState(true);
  const [scannerActive, setScannerActive] = useState(false);
  const [toast, setToast] = useState(null);
  const [lastPackedItemId, setLastPackedItemId] = useState(null);
  const [scanLoading, setScanLoading] = useState(false);

  const loadOrder = useCallback(async () => {
    setLoading(true);
    try {
      const data = await api.order(orderId);
      setOrder(data.order);
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
    if (scanLoading) return;
    setScanLoading(true);
    try {
      const data = await api.scan(orderId, barcode);
      setOrder(data.order);
      setLastPackedItemId(data.packedItem?.productId);
      setToast({ type: "success", message: data.message || "Item packed" });
      window.navigator.vibrate?.(70);
      setTimeout(() => setLastPackedItemId(null), 900);
    } catch (error) {
      setToast({ type: "error", message: error.message });
      window.navigator.vibrate?.([80, 40, 80]);
    } finally {
      setScanLoading(false);
    }
  }, [orderId, scanLoading]);

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

  const packed = order.packedStatus === "Packed";

  return (
    <main className="min-h-screen safe-bottom">
      <Toast toast={toast} onClose={() => setToast(null)} />
      <div className="mx-auto max-w-6xl px-4 py-4 sm:px-6 lg:px-8">
        <header className="mb-4 flex items-center justify-between gap-3">
          <Link href="/" className="grid h-10 w-10 place-items-center rounded-lg border border-black/10 bg-white dark:border-white/10 dark:bg-[#151f1a]" aria-label="Back">
            <ArrowLeft size={18} />
          </Link>
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm text-black/55 dark:text-white/55">{order.customerName}</p>
            <h1 className="truncate text-xl font-black">{order.invoiceNo}</h1>
          </div>
          <ThemeToggle />
        </header>

        {packed && (
          <section className="mb-4 flex items-center gap-3 rounded-lg bg-emerald-600 p-4 text-white shadow-soft">
            <CheckCircle2 size={28} />
            <div>
              <p className="font-black">Order Packed</p>
              <p className="text-sm text-white/80">सर्व माल पॅक झाला आहे.</p>
            </div>
          </section>
        )}

        <div className="grid gap-5 lg:grid-cols-[420px_1fr]">
          <div className="space-y-4">
            <section className="rounded-lg bg-white p-4 shadow-sm dark:bg-[#151f1a]">
              <ProgressRing packed={progress.packedQuantity} total={progress.totalQuantity} />
              <button
                onClick={() => setScannerActive((value) => !value)}
                className={`mt-4 flex w-full items-center justify-center gap-2 rounded-lg px-4 py-3 font-bold text-white ${scannerActive ? "bg-red-600" : "bg-leaf"}`}
              >
                {scannerActive ? <Square size={18} /> : <Play size={18} />}
                {scannerActive ? "Stop Scanner" : "Start Scanner"}
              </button>
            </section>
            {scannerActive && (
              <BarcodeScanner
                active={scannerActive}
                onScan={handleScan}
                onError={(message) => setToast({ type: "error", message })}
              />
            )}
          </div>

          <PackingChecklist items={order.items} lastPackedItemId={lastPackedItemId} />
        </div>
      </div>
    </main>
  );
}
