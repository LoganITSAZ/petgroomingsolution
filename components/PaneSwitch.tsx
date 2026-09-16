"use client";

import { useEffect, useId, useRef } from "react";
import { jQueryFactory } from "jquery/factory";

/**
 * Two panes in one box, switched by a tab strip.
 *
 * A `<details>` grows the panel it sits in, which pushes everything below it
 * down the page. Here the stack is locked to the tallest pane on mount, so a
 * switch is a crossfade inside a box that never changes size — nothing on the
 * page moves. jQuery owns the hiding and fading; React renders the panes once
 * and then leaves the subtree alone (same deal as MultiPicker).
 *
 * Without JavaScript both panes render stacked and the tabs do nothing: the
 * content is all readable, it just does not switch.
 */
export default function PaneSwitch({
  labels,
  panes,
  className = "",
}: {
  labels: string[];
  panes: React.ReactNode[];
  className?: string;
}) {
  const rootRef = useRef<HTMLDivElement>(null);
  const id = useId();

  useEffect(() => {
    const root = rootRef.current;
    if (!root) return;
    // Only after mounting: server rendering has no document.
    const $ = jQueryFactory(window);
    const $root = $(root);
    const $stack = $root.find("[data-stack]");
    const $panes = $stack.children("[data-pane]");
    const $tabs = $root.find("[data-tab]");
    let active = 0;

    const paint = () => {
      $tabs.each((index, el) => {
        const on = index === active;
        $(el)
          .attr("aria-selected", String(on))
          .attr("tabindex", on ? "0" : "-1")
          .toggleClass("text-brand-text", on)
          .toggleClass("text-muted", !on);
      });
    };

    // The stack is as tall as its tallest pane, measured in flow before the
    // panes are stacked on top of each other. Re-measured on resize, because
    // an address wraps to a second line on a narrow screen.
    const measure = () => {
      $panes.css({ position: "static", display: "block", opacity: 1 });
      $stack.css("height", "");
      let tallest = 0;
      $panes.each((_, el) => {
        tallest = Math.max(tallest, el.offsetHeight);
      });
      $stack.css({ position: "relative", height: tallest });
      $panes.css({ position: "absolute", top: 0, left: 0, right: 0 });
      $panes.each((index, el) => {
        $(el).css("display", index === active ? "block" : "none");
      });
    };

    const show = (next: number) => {
      if (next === active || next < 0 || next >= $panes.length) return;
      const from = $panes.eq(active);
      active = next;
      paint();
      from.stop(true, true).fadeOut(120, () => {
        $panes.eq(active).stop(true, true).fadeIn(160);
      });
    };

    $tabs.on("click", function (this: HTMLElement) {
      show($tabs.index(this));
    });
    // Left/right move between tabs, which is what a tab strip owes the keyboard.
    $tabs.on("keydown", function (this: HTMLElement, event) {
      const step = event.key === "ArrowRight" ? 1 : event.key === "ArrowLeft" ? -1 : 0;
      if (!step) return;
      event.preventDefault();
      const next = ($tabs.index(this) + step + $tabs.length) % $tabs.length;
      show(next);
      ($tabs.get(next) as HTMLElement | undefined)?.focus();
    });

    measure();
    paint();
    $(window).on("resize.paneswitch", measure);

    return () => {
      $tabs.off("click keydown");
      $(window).off("resize.paneswitch");
    };
  }, []);

  return (
    <div ref={rootRef} className={className}>
      <div role="tablist" aria-label="Shop details" className="flex gap-4 px-6 pt-3 md:px-7">
        {labels.map((label, index) => (
          <button
            key={label}
            type="button"
            data-tab
            role="tab"
            id={`${id}-tab-${index}`}
            aria-controls={`${id}-pane-${index}`}
            aria-selected={index === 0}
            className="rounded text-sm font-semibold text-muted transition-colors hover:text-brand-text"
          >
            {label}
          </button>
        ))}
      </div>
      <div data-stack className="px-6 pb-4 pt-3 md:px-7">
        {panes.map((pane, index) => (
          <div
            key={labels[index]}
            data-pane
            role="tabpanel"
            id={`${id}-pane-${index}`}
            aria-labelledby={`${id}-tab-${index}`}
          >
            {pane}
          </div>
        ))}
      </div>
    </div>
  );
}
