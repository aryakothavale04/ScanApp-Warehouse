export default function ProgressRing({ packed = 0, total = 0 }) {
  const percent = total ? Math.round((packed / total) * 100) : 0;

  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between text-xs font-semibold sm:text-sm">
        <span>Packing Progress</span>
        <span>{packed}/{total}</span>
      </div>
      <div className="h-2 overflow-hidden rounded-full bg-black/10 dark:bg-white/10 sm:h-3">
        <div
          className="h-full rounded-full bg-leaf transition-all duration-500"
          style={{ width: `${percent}%` }}
        />
      </div>
      <p className="text-[11px] text-black/55 dark:text-white/55 sm:text-xs">{percent}% complete</p>
    </div>
  );
}
