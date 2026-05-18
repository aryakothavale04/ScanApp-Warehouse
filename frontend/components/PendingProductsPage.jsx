"use client";

import Link from "next/link";
import { ArrowLeft, Download, Loader2 } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { api } from "@/src/lib/api";
import StoreBrand from "./StoreBrand";
import Toast from "./Toast";

function formatQty(value) {
  const number = Number(value) || 0;
  return Number.isInteger(number) ? number : Number(number.toFixed(3));
}

function getProductDisplayName(item) {
  return item.productName || "Unnamed product";
}

function splitTextLines(context, text, maxWidth) {
  const words = text.toString().split(/\s+/).filter(Boolean);
  if (!words.length) return [text.toString()];

  const lines = [];
  let currentLine = "";

  words.forEach((word) => {
    const candidate = currentLine ? `${currentLine} ${word}` : word;
    if (context.measureText(candidate).width <= maxWidth) {
      currentLine = candidate;
      return;
    }

    if (currentLine) {
      lines.push(currentLine);
      currentLine = "";
    }

    let remaining = word;
    while (context.measureText(remaining).width > maxWidth && remaining.length > 1) {
      let sliceLength = remaining.length;
      while (sliceLength > 1 && context.measureText(remaining.slice(0, sliceLength)).width > maxWidth) {
        sliceLength -= 1;
      }
      lines.push(remaining.slice(0, sliceLength));
      remaining = remaining.slice(sliceLength);
    }
    currentLine = remaining;
  });

  if (currentLine) lines.push(currentLine);
  return lines;
}

function buildPdfFromImages(images) {
  const encoder = new TextEncoder();
  const objects = [];
  const addObject = (chunks) => {
    objects.push(Array.isArray(chunks) ? chunks : [chunks]);
    return objects.length;
  };

  const catalogId = addObject("");
  const pagesId = addObject("");
  const pageIds = [];

  images.forEach((image, index) => {
    const imageId = addObject([
      `<< /Type /XObject /Subtype /Image /Width ${image.pixelWidth} /Height ${image.pixelHeight} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${image.bytes.length} >>\nstream\n`,
      image.bytes,
      "\nendstream"
    ]);
    const content = `q\n595 0 0 842 0 0 cm\n/Im${index + 1} Do\nQ`;
    const contentLength = encoder.encode(content).length;
    const contentId = addObject(`<< /Length ${contentLength} >>\nstream\n${content}\nendstream`);
    const pageId = addObject(`<< /Type /Page /Parent ${pagesId} 0 R /MediaBox [0 0 595 842] /Resources << /ProcSet [/PDF /ImageC] /XObject << /Im${index + 1} ${imageId} 0 R >> >> /Contents ${contentId} 0 R >>`);
    pageIds.push(pageId);
  });

  objects[catalogId - 1] = [`<< /Type /Catalog /Pages ${pagesId} 0 R >>`];
  objects[pagesId - 1] = [`<< /Type /Pages /Kids [${pageIds.map((id) => `${id} 0 R`).join(" ")}] /Count ${pageIds.length} >>`];

  const chunks = ["%PDF-1.4\n"];
  const offsets = [0];
  let length = encoder.encode(chunks[0]).length;

  objects.forEach((objectChunks, index) => {
    offsets.push(length);
    const prefix = `${index + 1} 0 obj\n`;
    chunks.push(prefix);
    length += encoder.encode(prefix).length;

    objectChunks.forEach((chunk) => {
      chunks.push(chunk);
      length += typeof chunk === "string" ? encoder.encode(chunk).length : chunk.length;
    });

    const suffix = "\nendobj\n";
    chunks.push(suffix);
    length += encoder.encode(suffix).length;
  });

  const xrefOffset = length;
  const xref = [
    "xref",
    `0 ${objects.length + 1}`,
    "0000000000 65535 f ",
    ...offsets.slice(1).map((offset) => `${offset.toString().padStart(10, "0")} 00000 n `),
    "trailer",
    `<< /Size ${objects.length + 1} /Root ${catalogId} 0 R >>`,
    "startxref",
    xrefOffset.toString(),
    "%%EOF"
  ].join("\n");

  return new Blob([...chunks, xref], { type: "application/pdf" });
}

function canvasToJpegBytes(canvas) {
  return new Promise((resolve, reject) => {
    canvas.toBlob(async (blob) => {
      if (!blob) {
        reject(new Error("Could not render pending products PDF."));
        return;
      }

      resolve(new Uint8Array(await blob.arrayBuffer()));
    }, "image/jpeg", 0.95);
  });
}

async function buildPendingProductsPdf(products) {
  const generatedAt = new Date();
  const totalQuantity = products.reduce((sum, product) => sum + (Number(product.pendingQuantity) || 0), 0);
  const scale = 2;
  const pageWidth = 595;
  const pageHeight = 842;
  const margin = 44;
  const productColumnWidth = 382;
  const rows = products.length
    ? products.map((product) => ({
        name: product.productName || "Unnamed product",
        quantity: formatQty(product.pendingQuantity).toString()
      }))
    : [{ name: "No pending products.", quantity: "" }];

  const measureCanvas = document.createElement("canvas");
  const measureContext = measureCanvas.getContext("2d");
  measureContext.font = "700 10px Arial, Noto Sans Devanagari, Nirmala UI, sans-serif";

  const preparedRows = rows.map((row) => {
    const lines = splitTextLines(measureContext, row.name, productColumnWidth);
    return {
      ...row,
      lines,
      height: Math.max(32, lines.length * 13 + 15)
    };
  });

  const pages = [];
  let pageRows = [];
  let usedHeight = 150;

  preparedRows.forEach((row) => {
    if (pageRows.length && usedHeight + row.height > pageHeight - margin - 30) {
      pages.push(pageRows);
      pageRows = [];
      usedHeight = 118;
    }

    pageRows.push(row);
    usedHeight += row.height;
  });

  if (pageRows.length) pages.push(pageRows);

  const images = [];

  for (const [pageIndex, currentRows] of pages.entries()) {
    const canvas = document.createElement("canvas");
    canvas.width = pageWidth * scale;
    canvas.height = pageHeight * scale;
    const context = canvas.getContext("2d");
    context.scale(scale, scale);
    context.fillStyle = "#ffffff";
    context.fillRect(0, 0, pageWidth, pageHeight);

    context.fillStyle = "#17201b";
    context.font = "900 18px Arial, Noto Sans Devanagari, Nirmala UI, sans-serif";
    context.fillText("Pending Products", margin, 52);

    context.font = "400 9px Arial, Noto Sans Devanagari, Nirmala UI, sans-serif";
    context.fillStyle = "#586159";
    context.fillText(`Generated: ${generatedAt.toLocaleString()}`, margin, 72);
    context.fillText(`Products: ${products.length}   Total pending qty: ${formatQty(totalQuantity)}`, margin, 87);

    context.font = "800 10px Arial, Noto Sans Devanagari, Nirmala UI, sans-serif";
    context.fillStyle = "#17201b";
    context.fillText("Product", margin, 118);
    context.textAlign = "right";
    context.fillText("Missing Qty", pageWidth - margin, 118);
    context.textAlign = "left";
    context.strokeStyle = "#dfe6da";
    context.beginPath();
    context.moveTo(margin, 128);
    context.lineTo(pageWidth - margin, 128);
    context.stroke();

    let y = 150;
    currentRows.forEach((row) => {
      context.fillStyle = "#17201b";
      context.font = "700 10px Arial, Noto Sans Devanagari, Nirmala UI, sans-serif";
      row.lines.forEach((line, lineIndex) => {
        context.fillText(line, margin, y + lineIndex * 13);
      });

      context.fillStyle = "#8a4b00";
      context.font = "900 10px Arial, Noto Sans Devanagari, Nirmala UI, sans-serif";
      context.textAlign = "right";
      context.fillText(row.quantity, pageWidth - margin, y);
      context.textAlign = "left";

      y += row.height;
      context.strokeStyle = "#eef2ea";
      context.beginPath();
      context.moveTo(margin, y - 10);
      context.lineTo(pageWidth - margin, y - 10);
      context.stroke();
    });

    context.fillStyle = "#586159";
    context.font = "400 8px Arial, Noto Sans Devanagari, Nirmala UI, sans-serif";
    context.fillText(`Page ${pageIndex + 1} of ${pages.length}`, margin, pageHeight - 28);

    images.push({
      bytes: await canvasToJpegBytes(canvas),
      pixelWidth: canvas.width,
      pixelHeight: canvas.height
    });
  }

  return buildPdfFromImages(images);
}

export default function PendingProductsPage() {
  const [orders, setOrders] = useState([]);
  const [loading, setLoading] = useState(true);
  const [downloadingPdf, setDownloadingPdf] = useState(false);
  const [toast, setToast] = useState(null);

  useEffect(() => {
    async function loadOrders() {
      setLoading(true);
      try {
        const data = await api.orders();
        setOrders(data.orders || []);
      } catch (error) {
        setToast({ type: "error", message: error.message });
      } finally {
        setLoading(false);
      }
    }

    loadOrders();
  }, []);

  const pendingProducts = useMemo(() => {
    const groups = new Map();

    orders
      .filter((order) => order.packedStatus !== "Completed" && order.packedStatus !== "Packed")
      .forEach((order) => {
        (order.items || []).forEach((item) => {
          const pendingQuantity = Math.max((item.quantity || 0) - (item.packedQuantity || 0), 0);
          if (!pendingQuantity) return;

          const productName = getProductDisplayName(item);
          const key = productName;
          const existing = groups.get(key) || {
            key,
            productName,
            pendingQuantity: 0
          };

          existing.pendingQuantity += pendingQuantity;
          groups.set(key, existing);
        });
      });

    return Array.from(groups.values()).sort((first, second) => first.productName.localeCompare(second.productName));
  }, [orders]);

  async function handleDownloadPdf() {
    setDownloadingPdf(true);
    try {
      const pdf = await buildPendingProductsPdf(pendingProducts);
      const url = URL.createObjectURL(pdf);
      const link = document.createElement("a");
      link.href = url;
      link.download = `pending-products-${new Date().toISOString().slice(0, 10)}.pdf`;
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.setTimeout(() => URL.revokeObjectURL(url), 30000);
    } catch (error) {
      setToast({ type: "error", message: error.message || "Could not download pending products PDF." });
    } finally {
      setDownloadingPdf(false);
    }
  }

  return (
    <main className="min-h-screen safe-bottom">
      <Toast toast={toast} onClose={() => setToast(null)} />
      <div className="mx-auto max-w-4xl px-3 py-3 sm:px-5 lg:px-6">
        <header className="sticky top-0 z-20 -mx-3 mb-3 grid grid-cols-[auto_1fr_auto] items-center gap-2 border-b border-black/5 bg-limewash/95 px-3 py-2 backdrop-blur dark:border-white/5 dark:bg-[#101714]/95 sm:static sm:mx-0 sm:border-0 sm:bg-transparent sm:px-0 sm:py-0 sm:backdrop-blur-none">
          <Link href="/" className="grid h-10 w-10 shrink-0 place-items-center rounded-lg border border-black/10 bg-white dark:border-white/10 dark:bg-[#151f1a] sm:h-11 sm:w-11" aria-label="Back">
            <ArrowLeft size={18} />
          </Link>
          <div className="min-w-0 flex-1">
            <StoreBrand compact />
            <h1 className="mt-0.5 truncate text-sm font-black sm:mt-1 sm:text-lg">Pending Product Details</h1>
          </div>
          <button
            type="button"
            onClick={handleDownloadPdf}
            disabled={loading || downloadingPdf || !pendingProducts.length}
            className="grid h-10 w-10 shrink-0 place-items-center rounded-lg bg-leaf text-white shadow-sm disabled:cursor-not-allowed disabled:opacity-50 sm:flex sm:min-h-11 sm:w-auto sm:gap-2 sm:px-3 sm:py-2 sm:text-sm sm:font-bold"
            aria-label="Download pending products PDF"
            title="Download PDF"
          >
            {downloadingPdf ? <Loader2 className="animate-spin" size={17} /> : <Download size={17} />}
            <span className="hidden sm:inline">{downloadingPdf ? "PDF..." : "PDF"}</span>
          </button>
        </header>

        {loading ? (
          <div className="grid min-h-[50vh] place-items-center">
            <Loader2 className="animate-spin text-leaf" size={34} />
          </div>
        ) : (
          <div className="grid gap-1.5">
            {pendingProducts.map((product) => (
              <section key={product.key} className="flex min-h-14 items-center justify-between gap-3 rounded-lg bg-white px-3 py-2.5 shadow-sm dark:bg-[#151f1a] sm:min-h-12 sm:py-2">
                <p className="min-w-0 flex-1 text-sm font-bold leading-snug">{product.productName}</p>
                <p className="shrink-0 rounded-full bg-amber-100 px-2.5 py-1 text-sm font-black text-amber-800 dark:bg-amber-950 dark:text-amber-100">
                  {formatQty(product.pendingQuantity)}
                </p>
              </section>
            ))}
            {!pendingProducts.length && (
              <div className="rounded-lg bg-white p-6 text-center text-sm text-black/55 shadow-sm dark:bg-[#151f1a] dark:text-white/55">
                No pending products.
              </div>
            )}
          </div>
        )}
      </div>
    </main>
  );
}
