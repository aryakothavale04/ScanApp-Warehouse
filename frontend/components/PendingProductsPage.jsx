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

function sanitizePdfText(value = "") {
  return value
    .toString()
    .normalize("NFKD")
    .replace(/[^\x20-\x7E]/g, "")
    .replace(/\\/g, "\\\\")
    .replace(/\(/g, "\\(")
    .replace(/\)/g, "\\)");
}

function truncateText(value, maxLength) {
  const text = value.toString();
  return text.length > maxLength ? `${text.slice(0, maxLength - 3)}...` : text;
}

function buildPendingProductsPdf(products) {
  const generatedAt = new Date();
  const totalQuantity = products.reduce((sum, product) => sum + (Number(product.pendingQuantity) || 0), 0);
  const rowsPerPage = 32;
  const pages = [];

  for (let index = 0; index < Math.max(products.length, 1); index += rowsPerPage) {
    pages.push(products.slice(index, index + rowsPerPage));
  }

  const objects = [];
  const addObject = (content) => {
    objects.push(content);
    return objects.length;
  };

  const catalogId = addObject("");
  const pagesId = addObject("");
  const fontId = addObject("<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>");
  const pageIds = [];

  pages.forEach((pageRows, pageIndex) => {
    const lines = [
      "BT",
      "/F1 16 Tf",
      "50 792 Td (Pending Products) Tj",
      "/F1 9 Tf",
      `0 -18 Td (Generated: ${sanitizePdfText(generatedAt.toLocaleString())}) Tj`,
      `0 -14 Td (Products: ${products.length}   Total pending qty: ${sanitizePdfText(formatQty(totalQuantity))}) Tj`,
      "/F1 11 Tf",
      "0 -28 Td (Product) Tj",
      "430 0 Td (Pending Qty) Tj",
      "-430 -8 Td (_______________________________________________) Tj",
      "/F1 10 Tf"
    ];

    if (pageRows.length) {
      pageRows.forEach((product) => {
        lines.push(`0 -18 Td (${sanitizePdfText(truncateText(product.productName || "Unnamed product", 64))}) Tj`);
        lines.push(`430 0 Td (${sanitizePdfText(formatQty(product.pendingQuantity))}) Tj`);
        lines.push("-430 0 Td");
      });
    } else {
      lines.push("0 -24 Td (No pending products.) Tj");
    }

    lines.push("/F1 8 Tf");
    lines.push(`0 -24 Td (Page ${pageIndex + 1} of ${pages.length}) Tj`);
    lines.push("ET");

    const stream = lines.join("\n");
    const streamLength = new TextEncoder().encode(stream).length;
    const contentId = addObject(`<< /Length ${streamLength} >>\nstream\n${stream}\nendstream`);
    const pageId = addObject(`<< /Type /Page /Parent ${pagesId} 0 R /MediaBox [0 0 595 842] /Resources << /Font << /F1 ${fontId} 0 R >> >> /Contents ${contentId} 0 R >>`);
    pageIds.push(pageId);
  });

  objects[catalogId - 1] = `<< /Type /Catalog /Pages ${pagesId} 0 R >>`;
  objects[pagesId - 1] = `<< /Type /Pages /Kids [${pageIds.map((id) => `${id} 0 R`).join(" ")}] /Count ${pageIds.length} >>`;

  const chunks = ["%PDF-1.4\n"];
  const encoder = new TextEncoder();
  const offsets = [0];
  let length = encoder.encode(chunks[0]).length;

  objects.forEach((object, index) => {
    offsets.push(length);
    const chunk = `${index + 1} 0 obj\n${object}\nendobj\n`;
    chunks.push(chunk);
    length += encoder.encode(chunk).length;
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

export default function PendingProductsPage() {
  const [orders, setOrders] = useState([]);
  const [loading, setLoading] = useState(true);
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

          const productName = (item.productName || "").trim();
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

  function handleDownloadPdf() {
    const pdf = buildPendingProductsPdf(pendingProducts);
    const url = URL.createObjectURL(pdf);
    const link = document.createElement("a");
    link.href = url;
    link.download = `pending-products-${new Date().toISOString().slice(0, 10)}.pdf`;
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
  }

  return (
    <main className="min-h-screen safe-bottom">
      <Toast toast={toast} onClose={() => setToast(null)} />
      <div className="mx-auto max-w-4xl px-3 py-3 sm:px-5 lg:px-6">
        <header className="sticky top-0 z-20 -mx-3 mb-3 flex items-center gap-3 border-b border-black/5 bg-limewash/95 px-3 py-2 backdrop-blur dark:border-white/5 dark:bg-[#101714]/95 sm:static sm:mx-0 sm:border-0 sm:bg-transparent sm:px-0 sm:py-0 sm:backdrop-blur-none">
          <Link href="/" className="grid h-11 w-11 shrink-0 place-items-center rounded-lg border border-black/10 bg-white dark:border-white/10 dark:bg-[#151f1a]" aria-label="Back">
            <ArrowLeft size={18} />
          </Link>
          <div className="min-w-0 flex-1">
            <StoreBrand compact />
            <h1 className="mt-1 text-lg font-black">Pending Product Details</h1>
          </div>
          <button
            type="button"
            onClick={handleDownloadPdf}
            disabled={loading || !pendingProducts.length}
            className="flex min-h-11 shrink-0 items-center justify-center gap-2 rounded-lg bg-leaf px-3 py-2 text-sm font-bold text-white shadow-sm disabled:cursor-not-allowed disabled:opacity-50"
          >
            <Download size={17} />
            PDF
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
