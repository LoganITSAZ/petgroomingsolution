"use client";

import { useId, useState, type ReactNode } from "react";

export default function VisitCardPanels({ children, hours }: { children: ReactNode; hours: ReactNode }) {
  const [showHours, setShowHours] = useState(false);
  const id = useId();

  return (
    <>
      <div role="group" aria-label="Visit information" className="mx-6 mt-5 flex rounded-xl border border-line bg-surface/60 p-1 md:mx-7">
        {["Today", "Full hours"].map((label, index) => {
          const selected = showHours === (index === 1);
          return (
            <button
              key={label}
              type="button"
              aria-pressed={selected}
              aria-controls={`${id}-${index}`}
              onClick={() => setShowHours(index === 1)}
              className={`min-h-11 flex-1 rounded-lg px-3 py-2 text-sm font-semibold transition-colors motion-reduce:transition-none ${selected ? "bg-brand-100/60 text-brand-text shadow-sm" : "text-muted hover:bg-brand-100/30"}`}
            >
              {label}
            </button>
          );
        })}
      </div>
      {/* Both panels size the same grid cell, reserving the taller panel's height.
          Visibility also removes inactive links from keyboard and screen-reader navigation. */}
      <div className="grid">
        <div id={`${id}-0`} className={`col-start-1 row-start-1 min-w-0 ${showHours ? "invisible" : "visible"}`} aria-hidden={showHours}>
          {children}
        </div>
        <div id={`${id}-1`} className={`col-start-1 row-start-1 min-w-0 ${showHours ? "visible" : "invisible"}`} aria-hidden={!showHours}>
          {hours}
        </div>
      </div>
    </>
  );
}
