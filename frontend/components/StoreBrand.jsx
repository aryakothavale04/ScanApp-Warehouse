"use client";

export default function StoreBrand({ compact = false }) {
  return (
    <div className="flex min-w-0 items-center gap-3">
      <div className="relative grid h-11 w-11 shrink-0 place-items-center overflow-hidden rounded-lg border border-black/10 bg-white shadow-sm dark:border-white/10 dark:bg-[#151f1a]">
        <span className="text-sm font-black text-leaf">JW</span>
        <img
          src="/store-logo.jpeg"
          alt="JAMADAR Wholesalers logo"
          className="absolute h-11 w-11 rounded-lg object-contain p-1"
          onError={(event) => {
            event.currentTarget.style.display = "none";
          }}
        />
      </div>
      <div className="min-w-0">
        <p className="text-sm font-semibold text-leaf">Packing Management</p>
        <h1 className={`${compact ? "text-lg sm:text-xl" : "text-2xl sm:text-3xl"} truncate font-black`}>
          JAMADAR Wholesalers
        </h1>
      </div>
    </div>
  );
}
