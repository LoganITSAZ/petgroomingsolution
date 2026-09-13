"use client";

import { useEffect, useRef } from "react";
import { debounce } from "@/lib/debounce";

/**
 * Auto-submits the filter form this wraps, so the "Apply" button is a
 * fallback rather than the only way in. The filter form is a plain GET form
 * (this is a server-rendered list, not client-side filtering), so "submit"
 * still means a page reload — this only removes the extra click.
 *
 * Search and date typing is debounced so the reload waits for a pause;
 * choosing a select is a deliberate, discrete action and submits at once.
 *
 * The reload is a real navigation, so focus lands back at the top of the
 * document — a keyboard user loses their place on every filter change, and
 * someone typing in search is thrown out of the box mid-word. The control that
 * caused the submit is recorded and refocused on the way back in, which is
 * what keeps this from being a WCAG 3.2.2 change of context.
 */
const FOCUS_KEY = "filter-autosubmit-focus";

export default function FilterAutoSubmit({
  children,
  debounceMs = 500,
}: {
  children: React.ReactNode;
  debounceMs?: number;
}) {
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const root = rootRef.current;
    if (!root) return;
    const form = root.querySelector("form");
    if (!form) return;

    /* Restore first: the key is only ever set by our own submit, and it is
       cleared on read, so an ordinary arrival never has focus moved. Scoped to
       the path so one page's filters cannot grab focus on another. */
    const stored = sessionStorage.getItem(FOCUS_KEY);
    sessionStorage.removeItem(FOCUS_KEY);
    if (stored) {
      const [path, name] = stored.split("\n");
      const field = path === location.pathname && name ? form.elements.namedItem(name) : null;
      if (field instanceof HTMLElement) {
        field.focus();
        // Put the caret back at the end of what was typed, not over it.
        if (field instanceof HTMLInputElement && field.type === "search") {
          field.setSelectionRange(field.value.length, field.value.length);
        }
      }
    }

    const remember = (target: HTMLElement) => {
      const { name } = target as HTMLInputElement | HTMLSelectElement;
      if (name) sessionStorage.setItem(FOCUS_KEY, `${location.pathname}\n${name}`);
    };

    const submitNow = () => form.requestSubmit();
    const submitDebounced = debounce(submitNow, debounceMs);
    const controller = new AbortController();
    const { signal } = controller;

    form.addEventListener(
      "input",
      (event) => {
        const target = event.target as HTMLElement | null;
        if (target?.matches("input[type='search'], input[type='date']")) {
          remember(target);
          submitDebounced();
        }
      },
      { signal }
    );
    form.addEventListener(
      "change",
      (event) => {
        const target = event.target as HTMLElement | null;
        if (target?.matches("select")) {
          remember(target);
          submitNow();
        }
      },
      { signal }
    );

    return () => controller.abort();
  }, [debounceMs]);

  return (
    <div ref={rootRef} className="contents">
      {children}
    </div>
  );
}
