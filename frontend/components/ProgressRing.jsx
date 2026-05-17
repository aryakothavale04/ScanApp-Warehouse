export default function ProgressRing({ packed = 0, total = 0 }) {
  const percent = total ? Math.round((packed / total) * 100) : 0;

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between text-sm font-semibold">
        <span>Packing Progress</span>
        <span>{packed}/{total}</span>
      </div>
      <div className="h-3 overflow-hidden rounded-full bg-black/10 dark:bg-white/10">
        <div
          className="h-full rounded-full bg-leaf transition-all duration-500"
          style={{ width: `${percent}%` }}
        />
      </div>
      <p className="text-xs text-black/55 dark:text-white/55">{percent}% complete</p>
    </div>
  );
}
