import Link from "next/link";

// The only page in the app that would otherwise be prerendered, which would
// bake the shop's name into the title template at build time — the freeze the
// dynamic title in app/layout.tsx exists to avoid.
export const dynamic = "force-dynamic";

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
            className="bg-brand-600 hover:bg-brand-700 text-brand-on-600 hover:text-brand-on-700 px-5 py-2 rounded-lg text-sm font-semibold"
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
