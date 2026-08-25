"use client";

import { useEffect, useRef } from "react";
import $ from "jquery";

/**
 * A set of choices held inside one field, driven by jQuery.
 *
 * Roles are the case this was built for: a row of selects made picking two
 * roles feel like filling in a form twice. Here the field itself holds what is
 * chosen — one chip per choice with its own remove button — and the control
 * that adds another sits inside the same box, so adding and removing happen
 * where the answer already is.
 *
 * React never owns this subtree, same rule as [MultiPicker](./MultiPicker.tsx):
 * it renders one empty container and jQuery builds everything inside it. Each
 * chip carries a hidden input under the same field name, so the server reads
 * them with `formData.getAll(name)`.
 */

export interface TagOption {
  id: string;
  label: string;
}

const FIELD_CLASS =
  "w-full min-h-[2.75rem] border border-stone-200 rounded-lg px-2 py-1.5 flex flex-wrap items-center gap-1.5 bg-white focus-within:ring-2 focus-within:ring-amber-400";

export default function TagPicker({
  options,
  name,
  initialIds = [],
  addLabel = "+ Add",
  emptyLabel = "Nothing selected",
  noun = "item",
  required = true,
}: {
  options: TagOption[];
  name: string;
  initialIds?: string[];
  /** Placeholder on the in-field add control. */
  addLabel?: string;
  /** Shown inside the field while nothing is chosen. */
  emptyLabel?: string;
  /** Used in the labels a screen reader reads: "Remove groomer". */
  noun?: string;
  required?: boolean;
}) {
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const root = rootRef.current;
    if (!root) return;

    const $root = $(root);
    $root.empty();

    const $field = $("<div>", { class: FIELD_CLASS });
    const $chips = $("<span>", { class: "contents" });
    const $empty = $("<span>", { class: "text-sm text-stone-400 px-1" }).text(emptyLabel);
    /*
     * The add control is a select rather than a menu of buttons: it stays one
     * tab stop however many roles exist, and it is the same control a phone
     * already knows how to open.
     */
    const $add = $("<select>", {
      class:
        "text-sm text-amber-700 font-semibold bg-transparent border-0 px-1 py-1 focus:outline-none focus:ring-0 cursor-pointer",
      "aria-label": `Add a ${noun}`,
    }) as JQuery<HTMLSelectElement>;

    $field.append($empty, $chips, $add);
    $root.append($field);

    const byId = new Map(options.map((option) => [option.id, option]));
    const chosen: string[] = [];

    /** Rebuild the add menu from what is left, and the required flag with it. */
    function refresh(): void {
      $add.empty();
      const remaining = options.filter((option) => !chosen.includes(option.id));
      $add.append($("<option>", { value: "" }).text(remaining.length > 0 ? addLabel : "All added"));
      for (const option of remaining) {
        // .text() escapes: labels can be shop-entered content.
        $add.append($("<option>", { value: option.id }).text(option.label));
      }
      $add.val("");
      $add.prop("disabled", remaining.length === 0);

      $empty.toggleClass("hidden", chosen.length > 0);
      /*
       * Native validation without a hidden input: while nothing is chosen the
       * add control is the thing that must be answered, so the browser points
       * at the field the person has to use.
       */
      $add.prop("required", required && chosen.length === 0);
    }

    function addChip(id: string): void {
      const option = byId.get(id);
      if (!option || chosen.includes(id)) return;
      chosen.push(id);

      const $chip = $("<span>", {
        class:
          "inline-flex items-center gap-1 rounded-full bg-stone-100 border border-stone-200 pl-2.5 pr-1 py-0.5 text-sm text-stone-800",
        "data-id": id,
      });
      $chip.append($("<span>").text(option.label));
      $chip.append($("<input>", { type: "hidden", name, value: id }));
      $chip.append(
        $("<button>", {
          type: "button",
          "data-role": "remove",
          class:
            "text-stone-400 hover:text-red-600 leading-none px-1 rounded-full focus:outline-none focus:ring-2 focus:ring-amber-400",
          "aria-label": `Remove ${option.label} ${noun}`,
          text: "×",
        })
      );

      $chips.append($chip);
      refresh();
    }

    $add.on("change.tagpicker", function () {
      const id = $(this).val() as string;
      if (id) addChip(id);
    });

    $chips.on("click.tagpicker", "[data-role='remove']", function () {
      const $chip = $(this).closest("[data-id]");
      const id = $chip.attr("data-id");
      const index = chosen.indexOf(id ?? "");
      if (index >= 0) chosen.splice(index, 1);
      $chip.remove();
      refresh();
      $add.trigger("focus");
    });

    initialIds.filter((id) => byId.has(id)).forEach(addChip);
    refresh();

    return () => {
      $add.off(".tagpicker");
      $chips.off(".tagpicker");
      $root.empty();
    };
  }, [options, name, initialIds, addLabel, emptyLabel, noun, required]);

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
