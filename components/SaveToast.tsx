"use client";

import { useEffect, useState } from "react";

/**
 * "Saved", where the eye already is.
 *
 * Confirmation used to render as a band at the top of the page. On a long
 * settings form the save button is at the bottom, so the one thing you wanted
 * to know was the one thing off-screen — you saved, nothing appeared to
 * happen, and you scrolled up to check.
 *
 * This sits in the middle of the viewport, over whatever you were looking at,
 * and takes itself away. `role="status"` announces it once without stealing
 * focus, so a keyboard user stays where they were.
 */
export default function SaveToast({
  message,
  detail,
  tone = "success",
  children,
}: {
  message?: string;
  detail?: string;
  tone?: "success" | "error";
  /** The whole body, for a confirmation that already had its own markup. */
  children?: React.ReactNode;
}) {
  const [visible, setVisible] = useState(true);

  useEffect(() => {
    // An error is the one worth reading twice, so it stays a little longer.
    const timer = setTimeout(() => setVisible(false), tone === "error" ? 6000 : 2800);
    return () => clearTimeout(timer);
  }, [tone]);

  if (!visible) return null;

  const success = tone === "success";

  return (
    <div
      role="status"
      aria-live="polite"
      className="fixed inset-0 z-50 flex items-center justify-center pointer-events-none px-4"
    >
      <div
        className={[
          "save-toast pointer-events-auto max-w-sm w-full rounded-xl border shadow-lg px-4 py-3 flex items-start gap-3",
          success
            ? "bg-white border-stone-200"
            : "bg-white border-red-200",
        ].join(" ")}
      >
        <span
          aria-hidden="true"
          className={[
            "mt-0.5 flex h-6 w-6 flex-none items-center justify-center rounded-full text-sm font-bold",
            success ? "bg-green-100 text-green-700" : "bg-red-100 text-red-700",
          ].join(" ")}
        >
          {success ? "✓" : "!"}
        </span>
        <div className="min-w-0">
          {message && (
            <p className={`text-sm font-bold ${success ? "text-stone-900" : "text-red-800"}`}>
              {message}
            </p>
          )}
          {detail && <p className="text-sm text-stone-600 mt-0.5">{detail}</p>}
          {children && (
            <div className={`text-sm ${success ? "text-stone-800" : "text-red-800"}`}>{children}</div>
          )}
        </div>
        <button
          type="button"
          onClick={() => setVisible(false)}
          className="ml-auto -mr-1 -mt-1 flex-none rounded-md px-1.5 py-0.5 text-stone-400 hover:text-stone-700 hover:bg-stone-100 transition-colors"
          aria-label="Dismiss"
        >
          ✕
        </button>
      </div>
    </div>
  );
}
