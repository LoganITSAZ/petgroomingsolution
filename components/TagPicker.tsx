"use client";

import { useEffect, useRef } from "react";
import { jQueryFactory } from "jquery/factory";

/**
 * A set of choices held inside one field, driven by jQuery.
 *
 * Two halves, stacked: the field on top holds what is chosen — one chip per
 * choice with its own remove button — and under a hairline sits what is left
 * to pick, as chips to click. A chosen chip leaves the lower row, so the
 * choices only ever shrink and the control cannot fill up with options nobody
 * needs. When everything has been taken the lower row goes altogether.
 *
 * React never owns this subtree, same rule as [MultiPicker](./MultiPicker.tsx):
 * it renders one empty container and jQuery builds everything inside it. Each
 * chip carries a hidden input under the same field name, so the server reads
 * them with `formData.getAll(name)`.
 *
 * With `allowCustom` the options below are presets rather than the whole
 * vocabulary: the field takes typing as well, and anything typed becomes a
 * chip of its own. Health flags work that way — the shop writes its own
 * ("allergy:chicken") and the common ones are there to click.
 */

export interface TagOption {
  id: string;
  label: string;
}

const BOX_CLASS =
  "w-full border border-stone-200 rounded-lg bg-white overflow-hidden focus-within:ring-2 focus-within:ring-amber-400";
const FIELD_CLASS = "min-h-[2.75rem] px-2 py-1.5 flex flex-wrap items-center gap-1.5";
const OPTIONS_CLASS =
  "border-t border-stone-100 bg-well px-2 py-1.5 flex flex-wrap items-center gap-1.5";
const CHIP_CLASS =
  "inline-flex items-center gap-1 rounded-full bg-stone-100 border border-stone-200 pl-2.5 pr-1 py-0.5 text-sm text-stone-800";
const OPTION_CLASS =
  "rounded-full border border-stone-200 bg-white px-2.5 py-0.5 text-sm text-stone-600 hover:border-amber-300 hover:text-amber-800 transition-colors";

export default function TagPicker({
  options,
  name,
  initialIds = [],
  optionsLabel = "Add",
  emptyLabel = "Nothing selected",
  noun = "item",
  required = true,
  allowCustom = false,
  customPlaceholder = "Type and press Enter",
}: {
  options: TagOption[];
  name: string;
  initialIds?: string[];
  /** Heads the row of choices under the field: "Common flags", "Roles". */
  optionsLabel?: string;
  /** Shown inside the field while nothing is chosen. */
  emptyLabel?: string;
  /** Used in the labels a screen reader reads: "Remove groomer". */
  noun?: string;
  required?: boolean;
  /** Let anything typed become a chip, not only the options. */
  allowCustom?: boolean;
  customPlaceholder?: string;
}) {
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const root = rootRef.current;
    if (!root) return;
    // Initialize only after mounting; server rendering has no document.
    const $ = jQueryFactory(window);

    const $root = $(root);
    $root.empty();

    const $box = $("<div>", { class: BOX_CLASS });
    const $field = $("<div>", { class: FIELD_CLASS });
    const $chips = $("<span>", { class: "contents" });
    const $empty = $("<span>", { class: "text-sm text-stone-400 px-1" }).text(emptyLabel);

    /*
     * Typing lives in the field itself, above the choices — what is being
     * written and what has been chosen are the same answer, so they share a
     * box. The choices are a shortcut into it, not a second control.
     */
    const $custom = $("<input>", {
      type: "text",
      class:
        "flex-1 min-w-[8rem] text-sm text-stone-800 bg-transparent border-0 px-1 py-1 focus:outline-none focus:ring-0 placeholder:text-stone-400",
      placeholder: customPlaceholder,
      "aria-label": `Add a ${noun}`,
      autocomplete: "off",
    }) as JQuery<HTMLInputElement>;

    /*
     * Nothing else in the field can carry `required`, so with no text box
     * there is a focusable stand-in for it: the browser needs something real
     * to point its "please fill this in" at. Off-screen, never tabbed to
     * while the answer is already given.
     */
    const $guard = $("<input>", {
      type: "text",
      class: "sr-only",
      tabindex: -1,
      "aria-label": `Add a ${noun}`,
    }) as JQuery<HTMLInputElement>;

    $field.append($empty, $chips, allowCustom ? $custom : $guard);

    const $options = $("<div>", { class: OPTIONS_CLASS });
    const $optionsLabel = $("<span>", { class: "text-xs text-stone-500 pr-0.5" }).text(
      optionsLabel
    );
    const $optionChips = $("<span>", { class: "contents" });
    $options.append($optionsLabel, $optionChips);

    $box.append($field, $options);
    $root.append($box);

    const byId = new Map(options.map((option) => [option.id, option]));
    const chosen: string[] = [];

    function isChosen(id: string): boolean {
      return chosen.some((held) => held.toLowerCase() === id.toLowerCase());
    }

    /** Rebuild the row of choices from what is left, and the required flag with it. */
    function refresh(): void {
      $optionChips.empty();
      const remaining = options.filter((option) => !isChosen(option.id));
      for (const option of remaining) {
        $optionChips.append(
          // .text() escapes: labels can be shop-entered content.
          $("<button>", {
            type: "button",
            class: OPTION_CLASS,
            "data-add": option.id,
            "aria-label": `Add ${option.label} ${noun}`,
          }).text(option.label)
        );
      }
      // Nothing left to offer is a row with nothing in it. Take it away.
      $options.toggleClass("hidden", remaining.length === 0);

      $empty.toggleClass("hidden", chosen.length > 0);
      $custom.prop("required", required && allowCustom && chosen.length === 0);
      $guard.prop("required", required && !allowCustom && chosen.length === 0);
    }

    function addChip(id: string): void {
      const option = byId.get(id);
      if (!option && !allowCustom) return;
      const label = option?.label ?? id;
      // Case-insensitive: "Elderly" typed under an "elderly" chip is the same flag.
      if (isChosen(id)) return;
      chosen.push(id);

      const $chip = $("<span>", { class: CHIP_CLASS, "data-id": id });
      $chip.append($("<span>").text(label));
      $chip.append($("<input>", { type: "hidden", name, value: id }));
      $chip.append(
        $("<button>", {
          type: "button",
          "data-role": "remove",
          class: "text-stone-400 hover:text-red-600 leading-none px-1 rounded-full",
          "aria-label": `Remove ${label} ${noun}`,
          text: "×",
        })
      );

      $chips.append($chip);
      refresh();
    }

    $optionChips.on("click.tagpicker", "[data-add]", function () {
      addChip($(this).attr("data-add") ?? "");
      if (allowCustom) $custom.trigger("focus");
    });

    /** Whatever is half-typed, turned into a chip. Returns false if empty. */
    function commitCustom(): boolean {
      const text = ($custom.val() ?? "").toString().trim().replace(/,+$/, "").trim();
      $custom.val("");
      if (!text) return false;
      addChip(text);
      return true;
    }

    if (allowCustom) {
      $custom.on("keydown.tagpicker", (event) => {
        if (event.key === "Enter" || event.key === ",") {
          // Enter in a field inside a form submits it; this is an add, not a save.
          event.preventDefault();
          commitCustom();
        } else if (
          event.key === "Backspace" &&
          ($custom.val() ?? "").toString() === "" &&
          chosen.length > 0
        ) {
          $chips.children().last().find("[data-role='remove']").trigger("click");
        }
      });
      // Clicking Save with text still in the box must not drop it.
      $custom.on("blur.tagpicker", () => void commitCustom());
      $custom.closest("form").on("submit.tagpicker", () => void commitCustom());
    }

    $chips.on("click.tagpicker", "[data-role='remove']", function () {
      const $chip = $(this).closest("[data-id]");
      const id = $chip.attr("data-id");
      const index = chosen.indexOf(id ?? "");
      if (index >= 0) chosen.splice(index, 1);
      $chip.remove();
      refresh();
      // Back to the choices it just rejoined, or to the box it was typed in.
      if (allowCustom) $custom.trigger("focus");
    });

    initialIds.filter((id) => allowCustom || byId.has(id)).forEach(addChip);
    refresh();

    return () => {
      $custom.off(".tagpicker");
      $custom.closest("form").off(".tagpicker");
      $optionChips.off(".tagpicker");
      $chips.off(".tagpicker");
      $root.empty();
    };
  }, [
    options,
    name,
    initialIds,
    optionsLabel,
    emptyLabel,
    noun,
    required,
    allowCustom,
    customPlaceholder,
  ]);

  return (
    <div>
      <div ref={rootRef} />
      {/* Without JavaScript no chip is ever built, so ship a plain multi-select
          under the same field name. */}
      <noscript>
        <select
          name={name}
          multiple
          required={required}
          aria-label={noun.charAt(0).toUpperCase() + noun.slice(1)}
          defaultValue={initialIds}
          className="w-full border border-stone-200 rounded-lg px-3 py-2 text-sm"
        >
          {options.map((option) => (
            <option key={option.id} value={option.id}>
              {option.label}
            </option>
          ))}
        </select>
      </noscript>
    </div>
  );
}
