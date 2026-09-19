"use client";

import { useEffect, useId, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { jQueryFactory } from "jquery/factory";
import type { ServiceAlert, AlertSeverity } from "@/lib/alerts";
import { BOARD_COLUMNS } from "@/lib/appointment-flow";
import styles from "./floor-board.module.css";

/** React owns the shell; jQuery owns the tabs, panels, and movable pet cards. */

export interface LifecycleDestination {
  value: string;
  label: string;
  kind: "kennel" | "bath" | "grooming";
}
const NO_DESTINATIONS: LifecycleDestination[] = [];

export interface BoardArrival {
  id: string;
  petName: string;
  arrivalTime: string;
  assignedTo: string;
  overdue: boolean;
  /** What to ask the owner for at the door — the vaccination refusal line. */
  warning?: string | null;
}

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
  flags?: { label: string; severity: AlertSeverity }[];
  pickupNote?: { label: string; className: string };
}

/** Per-column occupancy of the stations behind it, for the header. */
export interface ColumnCapacity {
  used: number;
  capacity: number;
}

const FLAG_CLASSES = {
  critical: "border-red-200 bg-red-50 text-red-800",
  warning: "border-amber-200 bg-amber-50 text-amber-900",
  info: "border-stone-200 bg-stone-100 text-stone-700",
};
const NO_ARRIVAL_ALERTS: ServiceAlert[] = [];
const NO_ARRIVALS: BoardArrival[] = [];
const NO_ALERTS: Record<string, ServiceAlert[]> = {};
const STAGE_DESCRIPTIONS: Record<string, string> = {
  waiting: "Checked in · ready to begin",
  bath: "A fresh, clean start",
  drying: "Drying off · getting comfortable",
  grooming: "Finishing touches",
  pickup: "Final care · heading home",
};

export default function FloorBoard({
  pets,
  destinations = NO_DESTINATIONS,
  assign,
  arrivals,
  arrivalAlerts = NO_ARRIVAL_ALERTS,
  capacity,
  columnAlerts = NO_ALERTS,
  move,
}: {
  pets: BoardPet[];
  destinations?: LifecycleDestination[];
  assign?: (appointmentId: string, destination: string) => Promise<{ ok: boolean; error?: string; columnKey?: string }>;
  arrivals?: BoardArrival[];
  arrivalAlerts?: ServiceAlert[];
  columnAlerts?: Record<string, ServiceAlert[]>;
  /** Keyed by column key; absent for a column with no stations of its kind. */
  capacity: Record<string, ColumnCapacity>;
  move: (appointmentId: string, columnKey: string) => Promise<{ ok: boolean; error?: string }>;
}) {
  const rootRef = useRef<HTMLDivElement>(null);
  const router = useRouter();
  const boardId = useId();
  const initialized = useRef(false);
  const activeStage = useRef(arrivals ? "arrivals" : BOARD_COLUMNS[0].key);
  const [note, setNote] = useState("");
  const [announcement, setAnnouncement] = useState("");

  useEffect(() => {
    const root = rootRef.current;
    if (!root) return;
    // Initialize only after mounting; server rendering has no document.
    const $ = jQueryFactory(window);
    const $root = $(root).empty();
    const stages = arrivals ? [{ key: "arrivals", label: "Arrivals" }, ...BOARD_COLUMNS] : BOARD_COLUMNS;

    const assignmentForm = (id: string, name: string, arrival: boolean) => {
      const $form = $("<form>", { class: `assignment ${styles.assignment}`, "data-id": id, "data-name": name });
      const $select = $("<select>", { required: true, "aria-label": `Assign ${name} to`, class: styles.destination });
      $select.append($("<option>", { value: "", text: "Choose a destination" }));
      for (const [kind, label] of [["kennel", "Kennels"], ["bath", "Bathing stations"], ["grooming", "Grooming stations"]]) {
        const choices = destinations.filter((destination) => destination.kind === kind);
        if (!choices.length) continue;
        const $group = $("<optgroup>", { label });
        choices.forEach((destination) => $group.append($("<option>", { value: destination.value, text: destination.label })));
        $select.append($group);
      }
      $form.append($select, $("<button>", {
        type: "submit", class: styles.assignButton, disabled: !destinations.length,
        text: arrival ? "Check in & assign" : "Assign station / kennel",
      }));
      if (!destinations.length) $form.append($("<p>", { class: "text-xs text-muted", text: "No active destinations. Add stations or kennels to assign pets." }));
      return $form;
    };

    const chip = (pet: BoardPet) => {
      const $avatar = $("<span>", {
        class: `profile-avatar ${styles.avatar}`,
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
          `chip ${styles.pet}`,
        "aria-pressed": "false",
        title: `${pet.petName}${pet.stationName ? ` · ${pet.stationName}` : ""}${pet.kennelName ? ` · ${pet.kennelName}` : ""}. Drag to a stage, or tap and choose.`,
      }).append(
        $("<span>", { class: "flex items-center gap-2" }).append(
          $avatar,
          $("<span>", { class: "min-w-0 flex-1" }).append(
            $("<span>", { class: styles.petName, text: pet.petName }).append(
              pet.hasBiteHistory
                ? $("<span>", {
                    class: "ml-1 rounded bg-red-100 px-1 text-[10px] font-bold text-red-700",
                    text: "BITE",
                  })
                : []
            ),
            $("<span>", { class: styles.owner, text: pet.ownerName })
          )
        ),
        pet.pickupNote
          ? $("<span>", {
              class: `mt-1 inline-block rounded px-1.5 py-0.5 text-xs font-semibold ${pet.pickupNote.className}`,
              text: pet.pickupNote.label,
            })
          : [],
        ...(pet.flags ?? []).map((flag) => $("<span>", {
          class: `mt-1 inline-block rounded border px-1.5 py-0.5 text-xs font-semibold ${FLAG_CLASSES[flag.severity]}`,
          text: flag.label,
        })),
        // The station is a detail of the chip now, not a column of its own.
        pet.stationName
          ? $("<span>", {
              class:
                styles.location,
              text: pet.stationName,
            })
          : [],
        pet.kennelName
          ? $("<span>", {
              class:
                styles.location,
              text: pet.kennelName,
              "aria-label": `Kennel: ${pet.kennelName}`,
            })
          : []
      );
    };

    const column = (key: string, name: string, hint: string, index: number) => {
      const $list = $("<ul>", { class: `drop ${styles.list}`, "data-column": key });
      const $count = $("<span>", { class: `count ${styles.count}` });
      const $place = $("<button>", {
        type: "button",
        class:
          `place ${styles.place}`,
        text: "Move here",
        hidden: true,
        "data-column": key,
      });
      return $("<section>", {
        class: `col ${styles.column}`,
        "data-stage": key,
        role: "tabpanel",
        id: `${boardId}-panel-${key}`,
        "aria-labelledby": `${boardId}-tab-${key}`,
        tabindex: 0,
      }).append(
        $("<header>", {
          class: styles.columnHeader,
        }).append(
          $("<span>", { class: styles.step, text: String(index + 1).padStart(2, "0"), "aria-hidden": "true" }),
          $("<h3>", {
            class: styles.stageName,
            text: name,
            title: hint,
          }),
          $count
        ),
        ...(columnAlerts[key] ?? []).map((alert) => $("<a>", {
          href: alert.href === "/staff" ? "/staff/appointments?status=CHECKED_IN" : alert.href,
          class: `mx-2 mt-2 block rounded-lg border px-2 py-1.5 text-xs focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 ${FLAG_CLASSES[alert.severity]}`,
        }).append(
          $("<span>", { class: "block font-semibold", text: `${alert.severity === "critical" ? "Urgent · " : ""}${alert.title}` }),
          $("<span>", { class: "mt-0.5 block text-xs", text: alert.detail }),
        )),
        $("<p>", { class: `occupancy ${styles.occupancy}` }),
        $("<div>", { class: styles.meter, "aria-hidden": "true" }).append($("<span>", { class: "meter-fill" })),
        $list,
        $place
      );
    };

    const $strip = $("<div>", { class: styles.stages });
    const $tabs = $("<div>", { class: styles.tabs, role: "tablist", "aria-label": "Service stages" });
    const $selection = $("<p>", { class: styles.selection, hidden: true, "aria-live": "polite" });
    $strip.append($tabs, $selection);
    const activate = (key: string, focus = false) => {
      activeStage.current = key;
      $tabs.find("[role='tab']").each((_, element) => {
        const active = $(element).attr("data-column") === key;
        $(element).attr("aria-selected", String(active)).attr("tabindex", active ? 0 : -1);
        if (active && focus) element.focus();
      });
      $strip.find(".col").each((_, element) => {
        element.hidden = $(element).attr("data-stage") !== key;
      });
    };
    stages.forEach((entry, index) => {
      const room = capacity[entry.key];
      const hint = room
        ? `${entry.label}: ${room.used} of ${room.capacity} in use`
        : `${entry.label}: pets at this stage`;
      $tabs.append($("<button>", {
        type: "button", role: "tab", class: styles.tab,
        id: `${boardId}-tab-${entry.key}`,
        "aria-controls": `${boardId}-panel-${entry.key}`,
        "data-column": entry.key,
        "aria-label": entry.label,
      }).append(
        $("<span>", { text: entry.label }),
        $("<span>", { class: `tab-count ${styles.tabCount}`, "aria-hidden": "true" }),
        ...((entry.key === "arrivals" ? arrivalAlerts : columnAlerts[entry.key])?.length ? [$("<span>", { class: styles.alertDot, text: "!", "aria-label": "Stage has notices" })] : []),
      ));
      const $panel = column(entry.key, entry.label, hint, index);
      if (entry.key === "arrivals") {
        $panel.find(".drop").removeClass("drop").addClass("arrivals-list");
        $panel.find(".place").remove();
        $panel.find(`.${styles.meter}`).remove();
        const $list = $panel.find(".arrivals-list");
        arrivalAlerts.forEach((alert) => $list.before($("<a>", {
          href: alert.href,
          class: `mx-3 mb-2 block rounded-lg border p-3 text-xs ${FLAG_CLASSES[alert.severity]}`,
        }).append(
          $("<strong>", { class: "block", text: `${alert.severity === "critical" ? "Urgent · " : ""}${alert.title}` }),
          $("<span>", { text: `${alert.detail}${alert.id.startsWith("vaccination-") ? " · Booked within 7 days" : ""}` }),
        )));
        (arrivals ?? NO_ARRIVALS).forEach((arrival) => $list.append($("<li>", { class: styles.assignable }).append(
          $("<a>", { href: `/staff/appointments/${arrival.id}`, class: `${styles.pet} ${styles.arrival}` }).append(
            $("<span>", { class: styles.arrivalTime, text: arrival.arrivalTime }),
            $("<span>", { class: styles.petName, text: arrival.petName }),
            $("<span>", { class: styles.owner, text: `Assigned to ${arrival.assignedTo}` }),
            $("<span>", { class: arrival.overdue ? "mt-2 block text-xs font-semibold text-amber-700" : "mt-2 block text-xs text-muted", text: arrival.overdue ? "Past arrival time" : "Expected" }),
            // The shop-wide alert above names every pet due a booster; this is
            // the same fact on the card the counter is about to check in, which
            // is the moment somebody can actually ask for the certificate.
            arrival.warning
              ? $("<span>", { class: `mt-2 block rounded border px-1.5 py-0.5 text-xs font-semibold ${FLAG_CLASSES.critical}`, text: arrival.warning })
              : [],
            $("<span>", { class: styles.location, text: "Open appointment →" }),
          ),
          ...(assign ? [assignmentForm(arrival.id, arrival.petName, true)] : []),
        )));
        if (!arrivals?.length) $list.append($("<li>", { class: styles.empty, text: "No more arrivals scheduled today." }));
      }
      $strip.append($panel);
    });
    $root.append($strip);
    activate(activeStage.current);

    pets.forEach((pet) => {
      $strip.find(`.drop[data-column="${pet.columnKey}"]`).append($("<li>", { class: styles.assignable }).append(
        chip(pet),
        ...(assign && pet.columnKey === "waiting" ? [assignmentForm(pet.id, pet.petName, false)] : []),
      ));
    });

    // Refresh counts, station occupancy, and empty states after each move.
    const paint = () => {
      $strip.find(".col").each((_, element) => {
        const $col = $(element);
        const key = String($col.attr("data-stage"));
        const held = key === "arrivals" ? arrivals?.length ?? 0 : $col.find(".chip").length;
        const room = capacity[key];
        $col.find(".count").text(String(held));
        $tabs.find(`[data-column="${key}"]`).attr("aria-label", `${stages.find((entry) => entry.key === key)?.label}, ${held} pets${(key === "arrivals" ? arrivalAlerts : columnAlerts[key])?.length ? ", has notices" : ""}`).find(".tab-count").text(String(held));
        $col.find(".occupancy").text(key === "arrivals" ? `${held} remaining today · Choose a destination to check in` : room
          ? `${held} of ${room.capacity} stations occupied`
          : STAGE_DESCRIPTIONS[key]);
        $col.find(".meter-fill").css("width", room && room.capacity > 0 ? `${Math.min(100, held / room.capacity * 100)}%` : "0%");
        $col.find(".empty-state").remove();
        if (!held) $col.find(".drop").append($("<li>", {
          class: `empty-state ${styles.empty}`,
          text: "No pets at this stage",
        }));
      });
    };
    paint();

    let selected: JQuery<HTMLElement> | null = null;
    const select = ($chip: JQuery<HTMLElement> | null) => {
      $strip.find(".chip").removeClass("ring-2 ring-brand-600").attr("aria-pressed", "false");
      selected = $chip;
      if ($chip) $chip.addClass("ring-2 ring-brand-600").attr("aria-pressed", "true");
      $strip.find(".place").prop("hidden", !$chip);
      const name = pets.find((pet) => pet.id === $chip?.attr("data-id"))?.petName;
      $selection.prop("hidden", !$chip).text(name ? `${name} selected. Open a destination tab and choose Move here. Press Esc to cancel.` : "");
    };

    let moving = false;
    const drop = async ($chip: JQuery<HTMLElement>, columnKey: string) => {
      if (moving || !BOARD_COLUMNS.some((entry) => entry.key === columnKey)) return;
      moving = true;
      const id = String($chip.attr("data-id"));
      const petName = pets.find((pet) => pet.id === id)?.petName ?? "Pet";
      const columnLabel = BOARD_COLUMNS.find((entry) => entry.key === columnKey)?.label ?? columnKey;
      $chip.addClass("opacity-50");
      let result: { ok: boolean; error?: string };
      try {
        result = await move(id, columnKey);
      } catch {
        result = { ok: false, error: "Could not move this pet. Please try again." };
      } finally {
        moving = false;
      }
      $chip.removeClass("opacity-50");
      if (!result.ok) {
        setNote(result.error ?? "That move was refused.");
        return;
      }
      setNote("");
      setAnnouncement(`${petName} moved to ${columnLabel}`);
      const $item = $chip.closest("li");
      $item.find(".assignment").remove();
      if (assign && columnKey === "waiting") $item.append(assignmentForm(id, petName, false));
      $item.appendTo($strip.find(`.drop[data-column="${columnKey}"]`));
      select(null);
      paint();
      activate(columnKey, true);
      // The station written on the chip is decided by the server, so the chip
      // is only right again after this.
      router.refresh();
    };

    $strip
      .on("submit", ".assignment", (event) => {
        event.preventDefault();
        if (!assign || moving) return;
        const $form = $(event.currentTarget);
        const destination = String($form.find("select").val() ?? "");
        if (!destination) return;
        moving = true;
        $strip.find(".assignment :input").prop("disabled", true);
        $form.attr("aria-busy", "true");
        setNote("");
        void (async () => {
          try {
            const result = await assign(String($form.attr("data-id")), destination);
            if (!result.ok) {
              setNote(result.error ?? "Could not assign this pet.");
              return;
            }
            const label = destinations.find((entry) => entry.value === destination)?.label ?? "destination";
            setAnnouncement(`${$form.attr("data-name")} assigned to ${label}`);
            select(null);
            if (result.columnKey) activate(result.columnKey, true);
            router.refresh();
          } catch {
            setNote("Could not assign this pet. Refresh to check its current placement before trying again.");
          } finally {
            moving = false;
            $form.removeAttr("aria-busy");
            $strip.find(".assignment :input").prop("disabled", false);
          }
        })();
      })
      .on("click", "[role='tab']", (event) => activate(String($(event.currentTarget).attr("data-column"))))
      .on("keydown", "[role='tab']", (event) => {
        const index = stages.findIndex((entry) => entry.key === activeStage.current);
        const next = event.key === "ArrowRight" ? (index + 1) % stages.length
          : event.key === "ArrowLeft" ? (index + stages.length - 1) % stages.length
          : event.key === "Home" ? 0 : event.key === "End" ? stages.length - 1 : -1;
        if (next >= 0) {
          event.preventDefault();
          activate(stages[next].key, true);
        }
      })
      .on("dragstart", ".chip", (event) => {
        const chipId = String($(event.currentTarget).attr("data-id"));
        (event.originalEvent as DragEvent).dataTransfer?.setData("text/plain", chipId);
        select($(event.currentTarget));
      })
      .on("dragover", ".drop, [role=tab]", (event) => {
        if ($(event.currentTarget).attr("data-column") === "arrivals") return;
        event.preventDefault();
        $(event.currentTarget).addClass("ring-2 ring-inset ring-brand-600");
      })
      .on("dragleave drop", ".drop, [role=tab]", (event) =>
        $(event.currentTarget).removeClass("ring-2 ring-inset ring-brand-600")
      )
      .on("drop", ".drop, [role=tab]", (event) => {
        event.preventDefault();
        const chipId = (event.originalEvent as DragEvent).dataTransfer?.getData("text/plain");
        const $chip = $strip.find(`.chip[data-id="${chipId}"]`);
        if ($chip.length) void drop($chip, String($(event.currentTarget).attr("data-column")));
      })
      .on("keydown", (event) => {
        if (event.key === "Escape") select(null);
      })
      .on("click", ".chip", (event) =>
        select(selected?.is(event.currentTarget) ? null : $(event.currentTarget))
      )
      .on("click", ".place", (event) => {
        if (selected) void drop(selected, String($(event.currentTarget).attr("data-column")));
      });

    const openArrivals = () => {
      if (arrivals && window.location.hash === "#arrivals") activate("arrivals");
    };
    const onArrivalLink = (event: MouseEvent) => {
      if (arrivals && event.target instanceof Element && event.target.closest('a[href="#arrivals"]')) activate("arrivals", true);
    };
    if (!initialized.current) {
      openArrivals();
      initialized.current = true;
    }
    window.addEventListener("hashchange", openArrivals);
    document.addEventListener("click", onArrivalLink);
    return () => {
      window.removeEventListener("hashchange", openArrivals);
      document.removeEventListener("click", onArrivalLink);
      $strip.off();
      $root.empty();
    };
  }, [pets, arrivals, arrivalAlerts, destinations, assign, capacity, columnAlerts, move, router, boardId]);

  return (
    <div className={styles.board} id={arrivals ? "arrivals" : undefined}>
      <div ref={rootRef} />
      <div className={styles.help}>
        <span>Drag a pet onto a stage tab, or select a pet, open a tab, and choose Move here.</span>
        <span>Press Esc to clear a selection</span>
      </div>
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
