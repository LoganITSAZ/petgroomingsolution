"use client";

import { useEffect, useRef } from "react";
import { isEndAfterStart } from "@/lib/thresholds";

/**
 * Live "end must be after start" warning for a promotion window.
 *
 * Scoped to its own subtree (not a global id lookup) because each promotion
 * row opens its own ModalButton, so several of these fields exist in the DOM
 * with the same `name` at once — only one dialog is open at a time, but ids
 * would still collide.
 */
export default function DateRangeLiveWarning({
  startName,
    endName,
      message,
        children,
}: {
  startName: string;
  endName: string;
  message: string;
  children: React.ReactNode;
}) {
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const root = rootRef.current;
    if (!root) return;
    const start = root.querySelector<HTMLInputElement>(`[name="${startName}"]`);
    const end = root.querySelector<HTMLInputElement>(`[name="${endName}"]`);
    const warning = root.querySelector<HTMLElement>("[data-role='range-warning']");
    if (!start || !end || !warning) return;

    const recompute = () => {
      warning.textContent = isEndAfterStart(start.value, end.value) ? "" : message;
    };

    recompute();
    const controller = new AbortController();
    start.addEventListener("input", recompute, { signal: controller.signal });
    end.addEventListener("input", recompute, { signal: controller.signal });
    return () => controller.abort();
  }, [startName, endName, message]);


  return (
    // `contents` keeps this wrapper invisible to CSS Grid, so its children —
    // the date fields and the warning — stay direct items of the grid this
    // is dropped into rather than nesting a box inside one of its cells.
    <div ref={rootRef} className="contents">
      {children}
      <p
        data-role="range-warning"
        role="status"
        aria-live="polite"
        className="empty:hidden text-xs font-semibold text-amber-700 sm:col-span-4"
      />
    </div>
  );
}
