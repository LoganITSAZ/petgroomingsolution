/** Skeleton while an admin screen's data loads. */
export default function Loading() {
  return (
    <div className="space-y-3 animate-pulse">
      <div className="h-10 w-64 bg-white border border-stone-200 rounded-lg" />
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {Array.from({ length: 4 }).map((_, index) => (
          <div key={index} className="h-20 bg-white border border-stone-200 rounded-xl" />
        ))}
      </div>
      <div className="h-72 bg-white border border-stone-200 rounded-xl" />
    </div>
  );
}
