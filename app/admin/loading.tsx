/** Skeleton while an admin screen's data loads. */
export default function Loading() {
  return (
    <div className="flex-1 min-h-0 flex flex-col gap-3 animate-pulse">
      <div className="h-6 w-64 bg-stone-200 rounded-lg" />
      {/* One page is one card — the skeleton has to read as the same shape. */}
      <div className="flex-1 bg-white border border-stone-200 rounded-xl overflow-hidden">
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 border-b border-stone-100 bg-stone-50 p-3">
          {Array.from({ length: 4 }).map((_, index) => (
            <div key={index} className="h-20 bg-stone-100 rounded-lg" />
          ))}
        </div>
        <div className="p-3 space-y-2">
          {Array.from({ length: 8 }).map((_, index) => (
            <div key={index} className="h-6 bg-stone-100 rounded" />
          ))}
        </div>
      </div>
    </div>
  );
}
