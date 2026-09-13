"use client";

import { useEffect, useRef } from "react";
import { isAscending } from "@/lib/thresholds";

/**
 * Live warning for a chain of escalating threshold fields (e.g. watch/late/
 * missed minutes). The server already reorders these defensively on save
 * (lib/thresholds.ts), so this is only an earlier heads-up — jQuery reads the
 * fields by id on every keystroke rather than lifting them into React state,
 * since nothing here needs to re-render the form.
 */
export default function ThresholdLiveWarning({
  fieldIds,
    message,
}: {
  fieldIds: string[];
  message: string;
}) {
  const ref = useRef<HTMLParagraphElement>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const inputs = fieldIds
      .map((id) => document.getElementById(id))
      .filter((input): input is HTMLInputElement => input !== null);

      const recompute = () => {
        const values = inputs.map((input) => Number(input.value) || 0);
        el.textContent = isAscending(values) ? "" : message;
    };

    recompute();
    const controller = new AbortController();
    for (const input of inputs) {
      input.addEventListener("input", recompute, { signal: controller.signal });
    }
    return () => controller.abort();
  }, [fieldIds, message]);


  return (
    <p
      ref={ref}
      role="status"
      aria-live="polite"
      className="empty:hidden text-xs font-semibold text-amber-700"
    />
  );
}
