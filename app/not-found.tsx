import Link from "next/link";

export default function NotFound() {
  return (
    <div className="min-h-[60vh] flex items-center justify-center p-6">
      <div className="text-center">
        <p className="text-5xl">🐾</p>
        <h1 className="text-xl font-black text-stone-900 mt-3">Page not found</h1>
        <p className="text-sm text-stone-500 mt-1">
          That page does not exist, or the record it pointed at is gone.
        </p>
        <div className="flex items-center justify-center gap-3 mt-3">
          <Link
            href="/staff"
            className="bg-amber-700 hover:bg-amber-800 text-white px-5 py-2 rounded-lg text-sm font-semibold"
          >
            Staff dashboard
          </Link>
          <Link
            href="/"
            className="px-5 py-2 rounded-lg text-sm font-semibold text-stone-600 hover:bg-stone-100"
          >
            Home
          </Link>
        </div>
      </div>
    </div>
  );
}
