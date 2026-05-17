"use client";

import { Camera, CameraOff, ScanLine } from "lucide-react";
import { useEffect, useRef, useState } from "react";

export default function BarcodeScanner({ active, onScan, onError }) {
  const scannerRef = useRef(null);
  const onScanRef = useRef(onScan);
  const onErrorRef = useRef(onError);
  const lastScanRef = useRef({ value: "", at: 0 });
  const [ready, setReady] = useState(false);

  useEffect(() => {
    onScanRef.current = onScan;
    onErrorRef.current = onError;
  }, [onError, onScan]);

  useEffect(() => {
    let disposed = false;

    async function startScanner() {
      if (!active || scannerRef.current) return;
      try {
        const { Html5Qrcode } = await import("html5-qrcode");
        const scanner = new Html5Qrcode("barcode-reader", {
          verbose: false,
          formatsToSupport: undefined
        });
        scannerRef.current = scanner;
        await scanner.start(
          { facingMode: "environment" },
          {
            fps: 12,
            qrbox: (viewfinderWidth, viewfinderHeight) => {
              const width = Math.floor(Math.min(viewfinderWidth * 0.82, 360));
              const height = Math.floor(Math.min(viewfinderHeight * 0.34, 180));
              return { width, height };
            },
            aspectRatio: 1.777
          },
          (decodedText) => {
            const now = Date.now();
            if (lastScanRef.current.value === decodedText && now - lastScanRef.current.at < 1000) return;
            lastScanRef.current = { value: decodedText, at: now };
            Promise.resolve(onScanRef.current(decodedText)).catch((error) => {
              onErrorRef.current?.(error.message || "Scan failed");
            });
          }
        );
        if (!disposed) setReady(true);
      } catch (error) {
        onErrorRef.current?.(error.message || "Camera scanner could not start");
      }
    }

    async function stopScanner() {
      const scanner = scannerRef.current;
      if (!scanner) return;
      scannerRef.current = null;
      setReady(false);
      try {
        if (scanner.isScanning) await scanner.stop();
        await scanner.clear();
      } catch {
        scanner.clear?.();
      }
    }

    startScanner();
    if (!active) stopScanner();

    return () => {
      disposed = true;
      stopScanner();
    };
  }, [active]);

  return (
    <section className="overflow-hidden rounded-lg bg-ink text-white shadow-soft dark:bg-black">
      <div className="flex items-center justify-between px-4 py-3">
        <div className="flex items-center gap-2">
          <ScanLine size={20} />
          <div>
            <p className="text-sm font-bold">Mobile Scanner</p>
            <p className="text-xs text-white/60">Barcode camera mode</p>
          </div>
        </div>
        <span className={`flex items-center gap-1 rounded-full px-2 py-1 text-xs ${ready ? "bg-emerald-500/20 text-emerald-100" : "bg-white/10 text-white/60"}`}>
          {ready ? <Camera size={14} /> : <CameraOff size={14} />}
          {ready ? "Live" : "Starting"}
        </span>
      </div>
      <div className="relative min-h-[280px] bg-black">
        <div id="barcode-reader" className="min-h-[280px] w-full" />
        <div className="pointer-events-none absolute inset-x-8 top-1/2 h-28 -translate-y-1/2 rounded-lg border-2 border-white/80 shadow-[0_0_0_9999px_rgba(0,0,0,0.36)]" />
        <div className="pointer-events-none absolute inset-x-12 top-1/2 h-0.5 -translate-y-1/2 bg-saffron shadow-[0_0_18px_rgba(245,165,36,0.95)]" />
      </div>
    </section>
  );
}
