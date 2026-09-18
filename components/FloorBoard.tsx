"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { jQueryFactory } from "jquery/factory";
import { BOARD_COLUMNS } from "@/lib/appointment-flow";

/**
 * The floor, in five columns, rearranged by hand.
 *
 * It was one column per physical station — four groom tables and two baths
 * made seven columns that ran off the side of a shop terminal, and none of
 * them said what stage a pet was at. A column is a stage now (see
 * BOARD_COLUMNS); the station a pet is standing at is written on its chip,
 * which is where a station name is actually useful.
 *
 * jQuery owns this subtree, the same bargain as MultiPicker: React renders one
 * empty container and jQuery builds every column and chip inside it, so a drop
 * can move a chip immediately without React putting it back. `router.refresh()`
 * afterwards re-renders the rest of the page from the server, which re-seeds
 * this board on the next paint.
 *
 * Drag-and-drop is HTML5's, which does not exist on a touchscreen — and half
 * the shop's screens are touchscreens. Tapping a pet selects it and every
 * column grows a "Move here" button; that path is also the keyboard one.
 */

export interface BoardPet {
  id: string;
  petName: string;
  petPhotoUrl?: string | null;
  ownerName: string;
  /** Which column the pet is in right now. */
  columnKey: string;
  /** The station it is standing at, if any — shown on the chip. */
  stationName: string | null;
  /** Kennel bank and door label, when assigned. */
  kennelName?: string | null;
  hasBiteHistory: boolean;
  pickupNote?: { label: string; className: string };
}

/** Per-column occupancy of the stations behind it, for the header. */
export interface ColumnCapacity {
  used: number;
  capacity: number;
}

export default function FloorBoard({
  pets,
  capacity,
  move,
}: {
  pets: BoardPet[];
  /** Keyed by column key; absent for a column with no stations of its kind. */
  capacity: Record<string, ColumnCapacity>;
  move: (appointmentId: string, columnKey: string) => Promise<{ ok: boolean; error?: string }>;
}) {
  const rootRef = useRef<HTMLDivElement>(null);
  const router = useRouter();
  const [note, setNote] = useState("");
  const [announcement, setAnnouncement] = useState("");

  useEffect(() => {
    const root = rootRef.current;
    if (!root) return;
    // Initialize only after mounting; server rendering has no document.
    const $ = jQueryFactory(window);
    const $root = $(root).empty();

    const chip = (pet: BoardPet) => {
      const $avatar = $("<span>", {
        class: "profile-avatar h-10 w-10 shrink-0",
        "aria-hidden": "true",
        text: pet.petName.trim().charAt(0).toUpperCase(),
      });
      if (pet.petPhotoUrl) {
        const $photo = $("<img>", {
          alt: "",
          width: 40,
          height: 40,
          loading: "lazy",
          draggable: false,
          class: "h-full w-full object-cover",
        }).on("error", () => {
          $avatar.text(pet.petName.trim().charAt(0).toUpperCase());
        });
        $avatar.empty().append($photo);
        $photo.attr("src", pet.petPhotoUrl);
      }

      return $("<button>", {
        type: "button",
        draggable: true,
        "data-id": pet.id,
        class:
          "chip w-full cursor-grab rounded-lg border border-well-line bg-white px-3 py-2 text-left text-xs shadow-sm transition-colors hover:bg-well active:cursor-grabbing",
        title: `${pet.petName}${pet.stationName ? ` · ${pet.stationName}` : ""}${pet.kennelName ? ` · ${pet.kennelName}` : ""}. Drag to a stage, or tap and choose.`,
      }).append(
        $("<span>", { class: "flex items-center gap-2" }).append(
          $avatar,
          $("<span>", { class: "min-w-0 flex-1" }).append(
            $("<span>", { class: "block font-semibold text-stone-900", text: pet.petName }).append(
              pet.hasBiteHistory
                ? $("<span>", {
                    class: "ml-1 rounded bg-red-100 px-1 text-[9px] font-bold text-red-700",
                    text: "BITE",
                  })
                : []
            ),
            $("<span>", { class: "block truncate text-[10px] text-stone-500", text: pet.ownerName })
          )
        ),
        pet.pickupNote
          ? $("<span>", {
              class: `mt-1 inline-block rounded px-1.5 py-0.5 text-[10px] font-semibold ${pet.pickupNote.className}`,
              text: pet.pickupNote.label,
            })
          : [],
        // The station is a detail of the chip now, not a column of its own.
        pet.stationName
          ? $("<span>", {
              class:
                "mt-2 inline-block max-w-full whitespace-normal break-words rounded-full border border-well-line bg-well px-2 py-0.5 text-[10px] font-semibold text-brand-text",
              text: pet.stationName,
            })
          : [],
        pet.kennelName
          ? $("<span>", {
              class:
                "mt-2 inline-block max-w-full whitespace-normal break-words rounded-full border border-well-line bg-well px-2 py-0.5 text-[10px] font-semibold text-brand-text",
              text: pet.kennelName,
              "aria-label": `Kennel: ${pet.kennelName}`,
            })
          : []
      );
    };

    const column = (key: string, name: string, hint: string) => {
      const $list = $("<ul>", { class: "drop min-h-[4rem] flex-1 space-y-2 overflow-y-auto p-2", "data-column": key });
      const $count = $("<span>", { class: "count shrink-0 text-[10px] font-bold text-stone-400" });
      const $place = $("<button>", {
        type: "button",
        class:
          "place hidden w-full border-t border-well-line px-2 py-1 text-[10px] font-bold tracking-tight text-brand-text hover:bg-well",
        text: "Move here",
        "data-column": key,
      });
      return $("<section>", {
        // Five columns share the width rather than scrolling off the edge.
        class: "glass-tile col flex h-full min-w-0 flex-1 basis-40 flex-col rounded-lg border border-well-line bg-well",
        role: "region",
            "aria-label": name,
      }).append(
        $("<header>", {
          class: "flex items-baseline justify-between gap-1 border-b border-well-line px-3 py-2",
        }).append(
          $("<span>", {
            class: "text-xs font-bold tracking-tight text-stone-600",
            text: name,
            title: hint,
          }),
          $count
        ),
        $list,
        $place
      );
    };

    const $strip = $("<div>", { class: "grid grid-cols-1 gap-2 pb-1 sm:grid-cols-2 lg:grid-cols-5" });
    BOARD_COLUMNS.forEach((entry) => {
      const room = capacity[entry.key];
      const hint = room
        ? `${entry.label}: ${room.used} of ${room.capacity} in use`
        : `${entry.label}: pets at this stage`;
      $strip.append(column(entry.key, entry.label, hint));
    });
    $root.append($strip);

    pets.forEach((pet) => {
      $strip.find(`.drop[data-column="${pet.columnKey}"]`).append($("<li>").append(chip(pet)));
    });

    /**
     * Headers, after anything moves. A column backed by stations reads as
     * "2/4" — how full the shop is at that stage is the thing the counter is
     * deciding on. A column with none just counts heads.
     */
    const paint = () => {
      $strip.find(".col").each((_, element) => {
        const $col = $(element);
        const key = String($col.find(".drop").attr("data-column"));
        const held = $col.find(".chip").length;
        const room = capacity[key];
        $col.find(".count").text(room ? `${held}/${room.capacity}` : String(held));
      });
    };
    paint();

    let selected: JQuery<HTMLElement> | null = null;
    const select = ($chip: JQuery<HTMLElement> | null) => {
      $strip.find(".chip").removeClass("ring-2 ring-brand-600");
      selected = $chip;
      if ($chip) $chip.addClass("ring-2 ring-brand-600");
      $strip.find(".place").toggleClass("hidden", !$chip);
    };

    const drop = async ($chip: JQuery<HTMLElement>, columnKey: string) => {
      const id = String($chip.attr("data-id"));
      const petName = pets.find((pet) => pet.id === id)?.petName ?? "Pet";
      const columnLabel = BOARD_COLUMNS.find((entry) => entry.key === columnKey)?.label ?? columnKey;
      $chip.addClass("opacity-50");
      const result = await move(id, columnKey);
      $chip.removeClass("opacity-50");
      if (!result.ok) {
        setNote(result.error ?? "That move was refused.");
        return;
      }
      setNote("");
      setAnnouncement(`${petName} moved to ${columnLabel}`);
      $chip.closest("li").appendTo($strip.find(`.drop[data-column="${columnKey}"]`));
      select(null);
      paint();
      // The station written on the chip is decided by the server, so the chip
      // is only right again after this.
      router.refresh();
    };

    $strip
      .on("dragstart", ".chip", (event) => {
        const chipId = String($(event.currentTarget).attr("data-id"));
        (event.originalEvent as DragEvent).dataTransfer?.setData("text/plain", chipId);
        select($(event.currentTarget));
      })
      .on("dragover", ".drop", (event) => {
        event.preventDefault();
        $(event.currentTarget).addClass("ring-2 ring-inset ring-brand-600");
      })
      .on("dragleave drop", ".drop", (event) =>
        $(event.currentTarget).removeClass("ring-2 ring-inset ring-brand-600")
      )
      .on("drop", ".drop", (event) => {
        event.preventDefault();
        const chipId = (event.originalEvent as DragEvent).dataTransfer?.getData("text/plain");
        const $chip = $strip.find(`.chip[data-id="${chipId}"]`);
        if ($chip.length) void drop($chip, String($(event.currentTarget).attr("data-column")));
      })
      .on("click", ".chip", (event) =>
        select(selected?.is(event.currentTarget) ? null : $(event.currentTarget))
      )
      .on("click", ".place", (event) => {
        if (selected) void drop(selected, String($(event.currentTarget).attr("data-column")));
      });

    return () => {
      $strip.off();
      $root.empty();
    };
  }, [pets, capacity, move, router]);

  return (
    <div className="flex flex-col">
      <div ref={rootRef} />
      <span className="sr-only" aria-live="polite">
        {announcement}
      </span>
      {note && (
        <p role="alert" className="mt-1 text-xs font-semibold text-red-700">
          {note}
        </p>
      )}
    </div>
  );
}
