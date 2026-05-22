"use client";

import { CheckCircle2, FileUp, Loader2, TriangleAlert } from "lucide-react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";
import { api } from "@/src/lib/api";

export default function ShareInvoicePage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [status, setStatus] = useState("uploading");
  const [message, setMessage] = useState("Receiving shared Vyapar PDF...");
  const [orderId, setOrderId] = useState("");

  useEffect(() => {
    let cancelled = false;

    async function uploadSharedInvoice() {
      if (searchParams.get("error")) {
        setStatus("error");
        setMessage("No PDF was shared. Please share the Vyapar invoice PDF again.");
        return;
      }

      try {
        const response = await fetch("/shared-invoice-pdf", { cache: "no-store" });
        if (!response.ok) {
          throw new Error("No shared PDF found. Please share the invoice again from Vyapar.");
        }

        const blob = await response.blob();
        const filename = response.headers.get("x-scanapp-filename") || "vyapar-invoice.pdf";
        const file = new File([blob], filename, { type: blob.type || "application/pdf" });

        setMessage("Uploading PDF and creating order...");
        const order = await api.uploadInvoice(file);
        if (cancelled) return;

        setStatus("success");
        setOrderId(order?._id || "");
        setMessage(`Order created for invoice ${order?.invoiceNo || ""}`.trim());

        if (order?._id) {
          window.setTimeout(() => {
            router.replace(`/orders/${order._id}`);
          }, 700);
        }
      } catch (error) {
        if (cancelled) return;
        setStatus("error");
        setMessage(error.message || "Could not upload shared invoice.");
      }
    }

    uploadSharedInvoice();

    return () => {
      cancelled = true;
    };
  }, [router, searchParams]);

  const Icon = status === "success" ? CheckCircle2 : status === "error" ? TriangleAlert : Loader2;

  return (
    <main className="grid min-h-screen place-items-center bg-limewash px-4 py-8 dark:bg-[#101714]">
      <section className="w-full max-w-sm rounded-lg border border-black/10 bg-white p-5 text-center shadow-soft dark:border-white/10 dark:bg-[#151f1a]">
        <div className="mx-auto mb-4 grid h-14 w-14 place-items-center rounded-lg bg-leaf/10 text-leaf">
          {status === "uploading" ? <Loader2 className="animate-spin" size={28} /> : <Icon size={28} />}
        </div>
        <h1 className="text-xl font-black">Vyapar PDF Share</h1>
        <p className="mt-2 text-sm font-semibold text-black/65 dark:text-white/65">{message}</p>
        {status === "error" && (
          <Link
            href="/"
            className="mt-5 flex min-h-11 items-center justify-center gap-2 rounded-lg bg-leaf px-4 py-2 text-sm font-bold text-white"
          >
            <FileUp size={18} />
            Open ScanApp
          </Link>
        )}
        {status === "success" && orderId && (
          <Link
            href={`/orders/${orderId}`}
            className="mt-5 flex min-h-11 items-center justify-center rounded-lg bg-leaf px-4 py-2 text-sm font-bold text-white"
          >
            Open Order
          </Link>
        )}
      </section>
    </main>
  );
}
