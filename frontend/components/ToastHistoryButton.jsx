"use client";

import { History, X } from "lucide-react";
import { useState } from "react";

export default function ToastHistoryButton({ messages = [], className = "" }) {
  const [open, setOpen] = useState(false);

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className={`grid h-9 w-9 place-items-center rounded-lg border border-black/10 bg-white text-black/70 shadow-sm transition hover:bg-limewash active:scale-95 dark:border-white/10 dark:bg-[#151f1a] dark:text-white/75 ${className}`}
        aria-label="Show toast history"
        title="Toast history"
      >
        <History size={16} />
      </button>

      {open && (
        <div className="fixed inset-0 z-50 grid place-items-end bg-black/45 p-2.5 sm:place-items-center sm:p-3">
          <section className="w-full max-w-md rounded-lg bg-white p-3 shadow-soft dark:bg-[#151f1a] sm:p-4">
            <div className="mb-3 flex items-center justify-between gap-3">
              <h2 className="text-base font-black sm:text-lg">Recent Messages</h2>
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="grid h-9 w-9 place-items-center rounded-lg border border-black/10 dark:border-white/10"
                aria-label="Close toast history"
              >
                <X size={18} />
              </button>
            </div>

            {messages.length ? (
              <div className="max-h-[60vh] space-y-2 overflow-y-auto pr-1">
                {messages.map((entry) => (
                  <div
                    key={entry.id}
                    className={`rounded-lg border p-2.5 text-sm ${
                      entry.type === "error"
                        ? "border-red-200 bg-red-50 text-red-800 dark:border-red-900 dark:bg-red-950 dark:text-red-100"
                        : "border-emerald-200 bg-emerald-50 text-emerald-800 dark:border-emerald-900 dark:bg-emerald-950 dark:text-emerald-100"
                    }`}
                  >
                    <p className="font-semibold">{entry.message}</p>
                    <p className="mt-1 text-[11px] opacity-70">{entry.time}</p>
                  </div>
                ))}
              </div>
            ) : (
              <p className="rounded-lg bg-black/5 p-4 text-center text-sm text-black/55 dark:bg-white/10 dark:text-white/55">
                No messages yet.
              </p>
            )}
          </section>
        </div>
      )}
    </>
  );
}
