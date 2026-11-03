"use client";

import { useId, useState } from "react";

/** Keep this beside the pet name, outside profile links. */
export default function BiteHistoryIndicator({ petName }: { petName: string }) {
  const id = useId();
  const [open, setOpen] = useState(false);
  return (
    <span className="relative inline-flex shrink-0 align-middle"
      onMouseEnter={() => setOpen(true)} onMouseLeave={() => setOpen(false)}>
      <button type="button" aria-label={`${petName}: bite history recorded`}
        aria-describedby={open ? id : undefined} aria-expanded={open}
        className="inline-flex h-7 w-7 items-center justify-center rounded text-red-700 dark:text-red-400 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-current"
        onFocus={() => setOpen(true)} onBlur={() => setOpen(false)}
        onClick={() => setOpen(true)}
        onKeyDown={(event) => { if (event.key === "Escape") { setOpen(false); event.stopPropagation(); } }}>
        <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d="M10.3 3.9 2.1 18.1A2 2 0 0 0 3.8 21h16.4a2 2 0 0 0 1.7-2.9L13.7 3.9a2 2 0 0 0-3.4 0Z" />
          <path d="M12 9v4m0 4h.01" />
        </svg>
      </button>
      {open && <span id={id} role="tooltip" className="absolute left-1/2 top-full z-30 w-40 -translate-x-1/2 rounded-md border border-line bg-surface px-3 py-2 text-left text-xs font-medium text-ink shadow-lg">Bite history recorded</span>}
    </span>
  );
}
