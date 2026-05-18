"use client";

import { Camera, CameraOff, ScanLine } from "lucide-react";
import { useEffect, useRef, useState } from "react";

const FAST_SCAN_FORMATS = [
  "QR_CODE",
  "EAN_13",
  "EAN_8",
  "UPC_A",
  "UPC_E",
  "CODE_128",
  "CODE_39",
  "CODE_93",
  "CODABAR",
  "ITF",
  "DATA_MATRIX",
  "PDF_417",
  "RSS_14",
  "RSS_EXPANDED",
  "UPC_EAN_EXTENSION"
];

export default function BarcodeScanner({ active, onScan, onError, compact = false }) {
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
        const { Html5Qrcode, Html5QrcodeSupportedFormats } = await import("html5-qrcode");
        const formatsToSupport = FAST_SCAN_FORMATS
          .map((format) => Html5QrcodeSupportedFormats?.[format])
          .filter((format) => format !== undefined);
        const scannerOptions = { verbose: false };
        if (formatsToSupport.length) {
          scannerOptions.formatsToSupport = formatsToSupport;
        }
        const scanner = new Html5Qrcode("barcode-reader", scannerOptions);
        scannerRef.current = scanner;
        const scannerConfig = {
          fps: 15,
          disableFlip: true,
          qrbox: (viewfinderWidth, viewfinderHeight) => {
            const width = Math.floor(Math.min(viewfinderWidth * 0.94, compact ? 300 : 460));
            const height = Math.floor(Math.min(viewfinderHeight * 0.42, compact ? 150 : 220));
            return { width, height };
          }
        };
        const onDecoded = (decodedText) => {
          const now = Date.now();
          if (lastScanRef.current.value === decodedText && now - lastScanRef.current.at < 650) return;
          lastScanRef.current = { value: decodedText, at: now };
          Promise.resolve(onScanRef.current(decodedText)).catch((error) => {
            onErrorRef.current?.(error.message || "Scan failed");
          });
        };

        const onDecodeError = () => {};

        await scanner.start(
          { facingMode: "environment" },
          scannerConfig,
          onDecoded,
          onDecodeError
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
      {!compact && (
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
      )}
      <div className={`relative bg-black ${compact ? "aspect-square min-h-0" : "min-h-[280px]"}`}>
        <div id="barcode-reader" className={compact ? "h-full w-full" : "min-h-[280px] w-full"} />
        <div className={`pointer-events-none absolute top-1/2 -translate-y-1/2 rounded-lg border-2 border-white/80 shadow-[0_0_0_9999px_rgba(0,0,0,0.36)] ${compact ? "inset-x-4 h-32" : "inset-x-6 h-40"}`} />
        <div className={`pointer-events-none absolute top-1/2 h-0.5 -translate-y-1/2 bg-saffron shadow-[0_0_18px_rgba(245,165,36,0.95)] ${compact ? "inset-x-7" : "inset-x-10"}`} />
      </div>
    </section>
  );
}
