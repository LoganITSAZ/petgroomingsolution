"use client";

import { useEffect, useRef } from "react";
import $ from "jquery";

/**
 * Repeatable selector, driven by jQuery.
 *
 * Wherever a record can hold several of something — services on a visit, roles
 * on a staff member — the row list has to grow on demand. React never owns
 * this subtree: it renders one empty container and jQuery builds, clones and
 * removes the rows inside it. Every row posts under the same field name, so
 * the server reads them with `formData.getAll(name)`.
 */

export interface PickerOption {
  id: string;
  label: string;
  /** optgroup heading, e.g. "Dogs" */
  group?: string;
  /** Shown in the running summary when present. */
  priceCents?: number | null;
  durationMins?: number | null;
}

const SELECT_CLASS =
  "flex-1 border border-stone-300 rounded-lg px-3 py-2 text-sm text-stone-800  bg-white";

function formatCents(cents: number): string {
  const dollars = cents / 100;
  return dollars % 1 === 0 ? `$${dollars.toFixed(0)}` : `$${dollars.toFixed(2)}`;
}

export default function MultiPicker({
  options,
  name,
  initialIds = [],
  addLabel = "+ Add another",
  placeholder = "Select…",
  noun = "item",
  showPrices = false,
  required = true,
}: {
  options: PickerOption[];
  name: string;
  initialIds?: string[];
  addLabel?: string;
  placeholder?: string;
  /** Used in the running summary: "3 services", "2 roles". */
  noun?: string;
  showPrices?: boolean;
  required?: boolean;
}) {
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const root = rootRef.current;
    if (!root) return;

    const $root = $(root);
    $root.empty();

    const $rows = $("<div>", { class: "space-y-2" });
    const $footer = $("<div>", { class: "flex items-center justify-between gap-3 mt-2" });
    const $add = $("<button>", {
      type: "button",
      class:
        "text-sm font-semibold text-amber-700 hover:text-amber-900 disabled:text-stone-400 disabled:cursor-not-allowed",
      text: addLabel,
    });
    // The running total changes as rows are picked; announce it rather than
    // leaving screen-reader users to discover it.
    const $summary = $("<span>", {
      class: "text-xs text-stone-500 text-right",
      "aria-live": "polite",
    });

    $footer.append($add, $summary);
    $root.append($rows, $footer);

    const byId = new Map(options.map((option) => [option.id, option]));

    function buildSelect(selectedId: string): JQuery<HTMLSelectElement> {
      const $select = $("<select>", {
        name,
        class: SELECT_CLASS,
        required,
        "aria-label": noun.charAt(0).toUpperCase() + noun.slice(1),
      }) as JQuery<HTMLSelectElement>;
      $select.append($("<option>", { value: "", text: placeholder, disabled: true }));

      const groups = Array.from(new Set(options.map((option) => option.group ?? "")));
      for (const group of groups) {
        const inGroup = options.filter((option) => (option.group ?? "") === group);
        // .text() escapes: labels are admin-entered content.
        const append = ($target: JQuery<HTMLElement>) => {
          for (const option of inGroup) {
            const price =
              showPrices && option.priceCents != null
                ? ` — from ${formatCents(option.priceCents)}`
                : "";
            $target.append($("<option>", { value: option.id }).text(`${option.label}${price}`));
          }
        };
        if (group) {
          const $group = $("<optgroup>", { label: group });
          append($group);
          $select.append($group);
        } else {
          append($select);
        }
      }

      $select.val(byId.has(selectedId) ? selectedId : "");
      return $select;
    }

    function refresh(): void {
      const $selects = $rows.find("select");
      const chosen = $selects
        .map((_, element) => $(element).val() as string)
        .get()
        .filter(Boolean);

      // The same option cannot be picked twice.
      $selects.each((_, element) => {
        const $select = $(element);
        const own = $select.val() as string;
        $select.find("option").each((__, option) => {
          const $option = $(option);
          const value = $option.attr("value");
          if (!value) return;
          $option.prop("disabled", value !== own && chosen.includes(value));
        });
      });

      $rows.find("[data-role='remove']").toggleClass("hidden", $selects.length <= 1);
      $add.prop("disabled", $selects.length >= options.length);

      const picked = chosen.map((id) => byId.get(id)).filter(Boolean) as PickerOption[];
      if (picked.length === 0) {
        $summary.text("");
        return;
      }

      const parts = [`${picked.length} ${noun}${picked.length !== 1 ? "s" : ""}`];
      if (showPrices) {
        const priced = picked.filter((option) => option.priceCents != null);
        const total = priced.reduce((sum, option) => sum + (option.priceCents ?? 0), 0);
        const minutes = picked.reduce((sum, option) => sum + (option.durationMins ?? 0), 0);
        if (priced.length > 0) {
          parts.push(
            priced.length === picked.length
              ? `from ${formatCents(total)}`
              : `from ${formatCents(total)} (some unpriced)`
          );
        }
        if (minutes > 0) parts.push(`about ${minutes} min`);
      }
      $summary.text(parts.join(" · "));
    }

    function addRow(selectedId = ""): void {
      const $row = $("<div>", { class: "flex items-center gap-2" });
      const $remove = $("<button>", {
        type: "button",
        "data-role": "remove",
        class: "text-xs font-semibold text-stone-500 hover:text-red-600 px-2 py-2",
        "aria-label": `Remove this ${noun}`,
        text: "Remove",
      });
      $row.append(buildSelect(selectedId), $remove);
      $rows.append($row);
      refresh();
    }

    $rows.on("change.multipicker", "select", refresh);
    $rows.on("click.multipicker", "[data-role='remove']", function () {
      if ($rows.find("select").length <= 1) return;
      $(this).closest("div").remove();
      refresh();
    });
    $add.on("click.multipicker", () => addRow());

    const initial = initialIds.filter((id) => byId.has(id));
    if (initial.length === 0) {
      addRow();
    } else {
      initial.forEach((id) => addRow(id));
    }

    return () => {
      $rows.off(".multipicker");
      $add.off(".multipicker");
      $root.empty();
    };
  }, [options, name, initialIds, addLabel, placeholder, noun, showPrices, required]);

  return (
    <div>
      <div ref={rootRef} />
      {/* Without JavaScript the jQuery rows never build, so ship a plain
          single-value select under the same field name. */}
      <noscript>
        <select
          name={name}
          required={required}
          aria-label={noun.charAt(0).toUpperCase() + noun.slice(1)}
          defaultValue=""
          className={SELECT_CLASS}
        >
          <option value="" disabled>
            {placeholder}
          </option>
          {options.map((option) => (
            <option key={option.id} value={option.id}>
              {option.group ? `${option.group} — ` : ""}
              {option.label}
            </option>
          ))}
        </select>
      </noscript>
    </div>
  );
}
