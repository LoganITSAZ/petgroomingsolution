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
  /** Distinguishes two auto-submitting forms on one page, so the one that did
      not cause the submit does not swallow the other's focus restore. */
  scope = "",
}: {
  children: React.ReactNode;
  debounceMs?: number;
  scope?: string;
}) {
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const root = rootRef.current;
    if (!root) return;
    /* The form is usually inside this wrapper, but a caller may equally wrap
       only the fields — the wrapper renders `display: contents`, so either
       nesting is the same document. Looking only downwards silently did
       nothing on a page that nested it the other way round. */
    const form = root.querySelector("form") ?? root.closest("form");
    if (!form) return;

    /* Restore first: the key is only ever set by our own submit, and the form
       that set it takes it back down, so an ordinary arrival never has focus
       moved. It is scoped to the path and `scope`, so one page's filters cannot
       grab focus on another — nor can a second auto-submitting form beside
       them, which is why a form that does not own the key leaves it alone
       rather than clearing it on read.
       ponytail: an unclaimed key outlives the load it was written on; claim it
       on the next arrival if a scope ever stops rendering its form. */
    const stored = sessionStorage.getItem(FOCUS_KEY);
    const [path, name] = stored?.split("\n") ?? [];
    if (path === `${location.pathname}#${scope}` && name) {
      sessionStorage.removeItem(FOCUS_KEY);
      const field = form.elements.namedItem(name);
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
      if (name) sessionStorage.setItem(FOCUS_KEY, `${location.pathname}#${scope}\n${name}`);
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
        // A date settles on `change` — picked off the calendar, or typed out in
        // full. Either is a finished answer, so it does not wait out the
        // typing debounce the `input` handler above applies to a half-typed one.
        if (target?.matches("select, input[type='date']")) {
          remember(target);
          submitNow();
        }
      },
      { signal }
    );

    return () => {
      controller.abort();
      submitDebounced.cancel();
    };
  }, [debounceMs, scope]);

  return (
    <div ref={rootRef} className="contents">
      {children}
    </div>
  );
}
