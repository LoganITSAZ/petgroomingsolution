/** Skeleton while a staff screen's data loads, so navigation feels immediate. */
export default function Loading() {
  return (
    <div className="space-y-3 animate-pulse">
      <div className="h-16 bg-white border border-stone-200 rounded-xl" />
      <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
        {Array.from({ length: 6 }).map((_, index) => (
          <div key={index} className="h-24 bg-white border border-stone-200 rounded-lg" />
        ))}
      </div>
      <div className="h-64 bg-white border border-stone-200 rounded-xl" />
    </div>
  );
}
