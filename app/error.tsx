"use client";

import { useEffect } from "react";
import Link from "next/link";

/**
 * Route-level error boundary. Without this file Next has nothing to render
 * when a page throws, and the dev overlay reports "missing required error
 * components".
 */
export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    // Server logs get the stack; the browser only ever sees the digest.
    console.error(error);
  }, [error]);

  return (
    <div className="min-h-[60vh] flex items-center justify-center p-6">
      <div className="bg-white border border-stone-200 rounded-xl p-4 max-w-md w-full text-center">
        <h1 className="text-xl font-black text-stone-900">Something went wrong</h1>
        <p className="text-sm text-stone-500 mt-2">
          The page could not be loaded. Trying again often clears it.
        </p>
        {error.digest && (
          <p className="text-xs text-stone-400 mt-2 font-mono">Reference: {error.digest}</p>
        )}
        <div className="flex items-center justify-center gap-3 mt-3">
          <button
            onClick={reset}
            className="bg-brand-600 hover:bg-brand-700 text-brand-on-600 hover:text-brand-on-700 px-5 py-2 rounded-lg text-sm font-semibold"
          >
            Try again
          </button>
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
