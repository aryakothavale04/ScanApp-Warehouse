"use client";

export default function Toast({ toast, onClose }) {
  if (!toast) return null;

  const tone = toast.type === "error"
    ? "border-red-200 bg-red-50 text-red-800 dark:border-red-900 dark:bg-red-950 dark:text-red-100"
    : "border-emerald-200 bg-emerald-50 text-emerald-800 dark:border-emerald-900 dark:bg-emerald-950 dark:text-emerald-100";

  return (
    <div className={`fixed left-4 right-4 top-4 z-50 rounded-lg border p-3 text-sm shadow-soft ${tone}`}>
      <div className="flex items-start justify-between gap-3">
        <p>{toast.message}</p>
        <button className="text-lg leading-none" onClick={onClose} aria-label="Close toast">
          ×
        </button>
      </div>
    </div>
  );
}
