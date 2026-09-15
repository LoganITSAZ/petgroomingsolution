"use client";

import { useEffect, useId, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { usePathname } from "next/navigation";
import Modal from "./Modal";

type Choice = { key: string; label: string; targets: HTMLElement[]; heading: HTMLElement };

/** Column controls for server-rendered page tables and standalone lists. */
export default function PageColumnsButton() {
  const anchor = useRef<HTMLSpanElement>(null);
  const pathname = usePathname();
  const titleId = useId();
  const [choices, setChoices] = useState<Choice[]>([]);
  const [hidden, setHidden] = useState<string[]>([]);
  const [activeHeading, setActiveHeading] = useState<HTMLElement | null>(null);

  useEffect(() => {
    const card = anchor.current?.closest("section");
    if (!card) return;
    const found: Choice[] = [];
    card.querySelectorAll<HTMLTableElement>("table:not([data-own-columns])").forEach((table, tableIndex) => {
      const headers = Array.from(table.tHead?.rows[0]?.cells ?? []);
      headers.forEach((header, index) => {
        // Keep the identifying first column visible.
        if (index === 0) return;
        const label = header.textContent?.trim() || `Column ${index + 1}`;
        found.push({
          key: `table-${tableIndex}-${index}-${label}`,
          label,
          heading: headers[0],
          targets: [header, ...Array.from(table.tBodies).flatMap(body => Array.from(body.rows).flatMap(row => {
            // Summary/empty-state rows span columns and must remain readable.
            if (Array.from(row.cells).some(cell => cell.colSpan > 1)) return [];
            return row.cells[index] ? [row.cells[index]] : [];
          }))],
        });
      });
    });
    if (!card.querySelector("table")) {
      card.querySelectorAll<HTMLElement>(".divide-y:not(.grid)").forEach((list, index) => {
        if (list.closest("table") || list.children.length === 0) return;
        const section = list.closest("[data-page-section]");
        const label = section?.querySelector("h2")?.textContent?.trim() || `List ${index + 1}`;
        const heading = section?.querySelector<HTMLElement>(".section-heading");
        if (heading) found.push({ key: `list-${index}-${label}`, label, targets: [list], heading });
      });
    }
    let saved: string[] = [];
    try {
      const parsed: unknown = JSON.parse(localStorage.getItem(`page-columns:${pathname}`) ?? "[]");
      if (Array.isArray(parsed)) saved = parsed.filter((value): value is string => typeof value === "string");
    } catch { /* Defaults remain available without browser storage. */ }
    setChoices(found);
    setHidden(saved);
    return () => found.forEach(choice => choice.targets.forEach(target => target.removeAttribute("data-column-hidden")));
  }, [pathname]);

  useEffect(() => {
    choices.forEach(choice => choice.targets.forEach(target => {
      target.toggleAttribute("data-column-hidden", hidden.includes(choice.key));
    }));
  }, [choices, hidden]);

  function update(next: string[]) {
    setHidden(next);
    try { localStorage.setItem(`page-columns:${pathname}`, JSON.stringify(next)); } catch { /* Session only. */ }
  }

  const headings = Array.from(new Set(choices.map(choice => choice.heading)));
  function controlTarget(heading: HTMLElement) {
    // Keep the control at the right edge, even when the final columns are hidden.
    const visibleColumns = choices.filter(choice => choice.heading === heading && !hidden.includes(choice.key));
    return heading.closest("thead") ? visibleColumns.at(-1)?.targets[0] ?? heading : heading;
  }
  return <span ref={anchor} className="contents">
    {headings.map((heading, index) => createPortal(<button type="button" aria-label="Choose columns" title="Choose columns" aria-haspopup="dialog" onClick={() => setActiveHeading(heading)} className="float-right ml-2 inline-flex h-7 w-7 shrink-0 items-center justify-center rounded text-stone-500 hover:bg-well hover:text-stone-800">
      <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden="true"><rect x="3" y="4" width="18" height="16" rx="2" /><path d="M9 4v16M15 4v16" /></svg>
    </button>, controlTarget(heading), String(index)))}
    {choices.length > 0 && <Modal open={activeHeading !== null} onClose={() => setActiveHeading(null)} labelledBy={titleId}>
      <h2 id={titleId} className="text-lg font-bold text-stone-900">Choose columns</h2>
      <p className="mt-1 text-sm text-stone-500">Choose the columns or lists to show in this section.</p>
      <div className="my-4 grid gap-3 sm:grid-cols-2">{choices.filter(choice => choice.heading === activeHeading).map(choice => <label key={choice.key} className="flex items-center gap-2 text-sm"><input type="checkbox" checked={!hidden.includes(choice.key)} onChange={event => update(event.target.checked ? hidden.filter(key => key !== choice.key) : [...hidden, choice.key])} />{choice.label}</label>)}</div>
      <div className="flex justify-between gap-3"><button type="button" onClick={() => update(hidden.filter(key => !choices.some(choice => choice.heading === activeHeading && choice.key === key)))} className="rounded-lg border border-stone-300 px-3 py-1.5 text-sm">Reset columns</button><button type="button" onClick={() => setActiveHeading(null)} className="rounded-lg bg-stone-800 px-4 py-1.5 text-sm text-white">Done</button></div>
    </Modal>}
  </span>;
}
