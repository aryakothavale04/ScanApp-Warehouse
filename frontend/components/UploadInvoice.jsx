"use client";

import { FileUp, Loader2 } from "lucide-react";
import { useRef, useState } from "react";
import { api } from "@/src/lib/api";

export default function UploadInvoice({ onUploaded, onToast }) {
  const inputRef = useRef(null);
  const [loading, setLoading] = useState(false);

  async function upload(file) {
    if (!file) return;
    setLoading(true);
    try {
      const order = await api.uploadInvoice(file);
      onToast({ type: "success", message: "Invoice uploaded. पॅकिंग लिस्ट तयार झाली." });
      onUploaded(order);
    } catch (error) {
      onToast({ type: "error", message: error.message });
    } finally {
      setLoading(false);
      if (inputRef.current) inputRef.current.value = "";
    }
  }

  return (
    <section className="rounded-lg border border-dashed border-leaf/40 bg-white p-4 shadow-soft dark:border-leaf/50 dark:bg-[#151f1a]">
      <input
        ref={inputRef}
        className="hidden"
        type="file"
        accept="application/pdf"
        onChange={(event) => upload(event.target.files?.[0])}
      />
      <button
        onClick={() => inputRef.current?.click()}
        disabled={loading}
        className="flex w-full items-center justify-center gap-2 rounded-lg bg-leaf px-4 py-3 font-semibold text-white disabled:opacity-60"
      >
        {loading ? <Loader2 className="animate-spin" size={20} /> : <FileUp size={20} />}
        Vyapar PDF Upload
      </button>
      <p className="mt-3 text-center text-xs text-black/55 dark:text-white/55">
        Invoice no, customer, items and quantity are extracted automatically.
      </p>
    </section>
  );
}
