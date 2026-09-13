"use client";

import { useEffect, useRef } from "react";

/**
 * "Same time every day" for the schedule grid, layered over the server-
 * rendered table rather than owning it — jQuery only reads/writes the time
 * inputs already there. Each staff row is one `<form>` per day (lib/schedule.ts
 * has no recurrence rule to drive this from), so filling seven identical
 * times by hand is the alternative this replaces.
 *
 * Only cells with no shift yet (`data-role="empty-start"`/`"empty-end"`) are
 * ever written to — an existing shift is a saved form of its own and this
 * control must never silently overwrite it.
 */
export default function ScheduleWeekSync({ children }: { children: React.ReactNode }) {
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const root = rootRef.current;
    if (!root) return;

    const sync = (staffId: string, field: "start" | "end", value: string) => {
      root
        .querySelectorAll<HTMLInputElement>(`[data-staff="${staffId}"] [data-role="empty-${field}"]`)
        .forEach((input) => {
          input.value = value;
        });
    };

    const rowOf = (element: Element) => element.closest("tr");
    const syncEnabled = (row: HTMLTableRowElement) =>
      row.querySelector<HTMLInputElement>("[data-role='row-sync-toggle']")?.checked ?? false;

      const controller = new AbortController();
      const { signal } = controller;

      root.addEventListener(
        "input",
      (event) => {
        const input = event.target as HTMLInputElement | null;
        if (!input?.matches("[data-role='empty-start'], [data-role='empty-end']")) return;
        const row = rowOf(input);
        if (!row || !syncEnabled(row)) return;
        const field = input.dataset.role === "empty-start" ? "start" : "end";
        sync(String(row.dataset.staff), field, input.value);
      },
      { signal }
    );

    // Turning the toggle on catches the row up to whatever the first day
    // already holds, rather than waiting for the next keystroke.
    root.addEventListener(
      "change",
      (event) => {
        const toggle = event.target as HTMLInputElement | null;
        if (!toggle?.matches("[data-role='row-sync-toggle']") || !toggle.checked) return;
        const row = rowOf(toggle);
        if (!row) return;
        const staffId = String(row.dataset.staff);
        const firstStart = row.querySelector<HTMLInputElement>("[data-role='empty-start']");
        const firstEnd = row.querySelector<HTMLInputElement>("[data-role='empty-end']");
        if (firstStart) sync(staffId, "start", firstStart.value);
        if (firstEnd) sync(staffId, "end", firstEnd.value);
      },
      { signal }
    );

    return () => controller.abort();
  }, []);

  return <div ref={rootRef}>{children}</div>;
}
