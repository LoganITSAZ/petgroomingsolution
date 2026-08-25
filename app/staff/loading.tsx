/** Skeleton while a staff screen's data loads, so navigation feels immediate. */
export default function Loading() {
  return (
    <div className="flex-1 min-h-0 flex flex-col gap-3 animate-pulse">
      <div className="h-6 w-56 bg-stone-200 rounded-lg" />
      {/* One page is one card — the skeleton has to read as the same shape. */}
      <div className="flex-1 bg-white border border-stone-200 rounded-xl overflow-hidden">
        <div className="h-12 border-b border-stone-100 bg-stone-50" />
        <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3 p-3">
          {Array.from({ length: 6 }).map((_, index) => (
            <div key={index} className="h-24 bg-stone-100 rounded-lg" />
          ))}
        </div>
        <div className="border-t border-stone-100 p-3 space-y-2">
          {Array.from({ length: 6 }).map((_, index) => (
            <div key={index} className="h-6 bg-stone-100 rounded" />
          ))}
        </div>
      </div>
    </div>
  );
}
