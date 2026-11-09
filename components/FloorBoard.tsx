"use client";

import { useEffect, useId, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { jQueryFactory } from "jquery/factory";
import type { AlertSeverity } from "@/lib/alerts";
import { BOARD_COLUMNS } from "@/lib/appointment-flow";
import { formatShopTime } from "@/lib/utils";
import styles from "./floor-board.module.css";

/** React owns the shell; jQuery owns the tabs, panels, and movable pet cards. */

export interface LifecycleDestination {
  value: string;
  label: string;
  kind: "kennel" | "bath" | "grooming";
  /** A work station already holding a pet. Shown, not hidden, so the list does not jump. */
  inUse?: boolean;
  /** A quiet line under the name, e.g. a kennel bank's empty doors, or the pet on a table in use. */
  note?: string;
  /** The note is a caution: nothing empty, only a shared door might take this pet. */
  tight?: boolean;
  /** When a taken table should be free, epoch ms: the "nothing free" line names the soonest. */
  freesAt?: number;
}
const NO_DESTINATIONS: LifecycleDestination[] = [];

export interface BoardArrival {
  id: string;
  petName: string;
  ownerName?: string;
  arrivalTime: string;
  /** The booked instant, epoch ms: how early or late the owner is, read at the desk. */
  scheduledAt?: number;
  assignedTo: string;
  /** Late, missed, or not current on vaccinations — worst first. */
  flags?: BoardFlag[];
  /** A plain status line that is not an alert. */
  note?: string | null;
  hasBiteHistory?: boolean;
  /** What the counter must know before taking the lead: shots, health, temperament. */
  checkInWarnings?: BoardFlag[];
  /** What was booked, one line, so the counter can confirm it with the owner. */
  services?: string;
  /** The booked slot, so the counter can tell the owner when to come back. */
  bookedMins?: number | null;
  /** Breed and age, then the size the visit was priced at and the weight behind it. */
  sizing?: string | null;
  /** What the owner asked for on this visit, read back at the counter. */
  visitNotes?: string | null;
  /** The last groom record, one line: what "same as last time" means. */
  lastGroom?: string | null;
  /** A live promotion on a service booked for this visit, for the counter to mention. */
  offer?: string | null;
  /** A punch-card reward waiting to be handed over, in the shop's words. */
  reward?: string | null;
  /** Read back at drop-off: the number the "ready for pickup" call goes to. */
  ownerPhone?: string | null;
  /** Other pets from the same home due today. */
  household?: { id: string; name: string }[];
  /** Searched, not shown on its own: "the doodle" finds the doodle. */
  breed?: string | null;
  /** Dogs from the same home already in the building, each "Max at Bath 1". */
  inShop?: string[];
  /** Who else the owner approved to drop off and collect, checked against who is at the counter. */
  alternates?: string[];
  /** A named rate and the shop's pricing note, for quoting at the counter. */
  rate?: string;
  /** The booking asked for a kennel. */
  needsKennel?: boolean;
  petPhotoUrl?: string | null;
  vet?: BoardVet | null;
  /** No finished visit on record: the counter takes a proper handover. */
  firstVisit?: boolean;
  /** The destination the booking already chose, as a `LifecycleDestination.value`. */
  suggested?: string | null;
  /** Why it leads, when the count alone would not say: "With Max". */
  suggestedReason?: string | null;
}

export interface BoardVet {
  name: string | null;
  phone: string | null;
}

export interface BoardFlag {
  label: string;
  severity: AlertSeverity;
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
  flags?: BoardFlag[];
  /** How long a finished pet has waited, while that is not yet a flag. */
  pickupNote?: string | null;
  /** Health flags and temperament, shown when the pet is placed. */
  checkInWarnings?: BoardFlag[];
  vet?: BoardVet | null;
}

/** Per-column occupancy of the stations behind it, for the header. */
export interface ColumnCapacity {
  used: number;
  capacity: number;
}

const FIND_AFTER = 8;
// Booked further out than this, an arrival recedes on the board and is left out of the "due" count.
const DUE_WITHIN_MS = 60 * 60_000;
// "Zoe" finds Zoë: the counter types names the way they sound, not the way the file spells them.
const fold = (text: string) => text.normalize("NFD").replace(/\p{M}/gu, "").toLowerCase();
const SEVERITY_ORDER: Record<AlertSeverity, number> = { critical: 0, warning: 1, info: 2 };
/** The worst severity among a card's flags, or undefined when it has none. */
const worstSeverity = (flags: BoardFlag[] = []) =>
  flags.reduce<AlertSeverity | undefined>((worst, entry) =>
    worst === undefined || SEVERITY_ORDER[entry.severity] < SEVERITY_ORDER[worst] ? entry.severity : worst, undefined);
const NO_ARRIVALS: BoardArrival[] = [];
/** An arrow going in through a door: put this pet somewhere. Stroked, not filled. */
const PLACE_PATH = "M2 8h8M7 5l3 3-3 3M10 2.5h2.5a1 1 0 0 1 1 1v9a1 1 0 0 1-1 1H10";
const FLAG_PATH = "M3 1.5a.75.75 0 0 1 .75.75V3h8.4a.6.6 0 0 1 .5.93L11.2 6.25l1.45 2.32a.6.6 0 0 1-.5.93h-8.4v5.25a.75.75 0 0 1-1.5 0V2.25A.75.75 0 0 1 3 1.5Z";
const STAGE_DESCRIPTIONS: Record<string, string> = {
  arrivals: "Expected today",
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
  capacity,
  move,
  closesAt,
  timeZone,
}: {
  pets: BoardPet[];
  destinations?: LifecycleDestination[];
  assign?: (appointmentId: string, destination: string) => Promise<{ ok: boolean; error?: string; columnKey?: string; placedAt?: string }>;
  arrivals?: BoardArrival[];
  /** Keyed by column key; absent for a column with no stations of its kind. */
  capacity: Record<string, ColumnCapacity>;
  move: (appointmentId: string, columnKey: string) => Promise<{ ok: boolean; error?: string }>;
  /** Today's closing time (epoch ms), from the shop's business hours; absent on a day with none. */
  closesAt?: number | null;
  /** The shop's zone from SystemConfig: this renders in a browser, which has no config of its own. */
  timeZone?: string;
}) {
  const rootRef = useRef<HTMLDivElement>(null);
  const router = useRouter();
  const boardId = useId();
  const initialized = useRef(false);
  // The next dog of a household booked together, opened once the board has redrawn.
  const nextUp = useRef<{ id: string; done: string } | null>(null);
  // A check-in found by search hands the cursor back to the search for the next owner at the desk.
  const findAgain = useRef<string | null>(null);
  // The pet just placed, lit once on the redrawn board so the eye finds where it went.
  const justPlaced = useRef<string | null>(null);
  // The dialog open when the minute's refresh redrew the board: reopened, so the counter is not interrupted.
  const reopen = useRef<{ id: string; name: string; more: boolean } | null>(null);
  // Likewise a half-typed search, and whether the cursor was in it.
  const query = useRef<{ value: string; focused: boolean } | null>(null);
  const activeStage = useRef(arrivals ? "arrivals" : BOARD_COLUMNS[0].key);
  const [note, setNote] = useState("");
  const [announcement, setAnnouncement] = useState("");

  useEffect(() => {
    const root = rootRef.current;
    if (!root) return;
    // Initialize only after mounting; server rendering has no document.
    const $ = jQueryFactory(window);
    const $root = $(root).empty();
    const stages = arrivals ? [{ key: "arrivals", label: "Pending" }, ...BOARD_COLUMNS] : BOARD_COLUMNS;

    /*
     * Placing a pet is a modal, not a dropdown per card. A shop with four banks
     * of doors put forty options behind every pet; here the counter picks the
     * pet, then the bank, and the server picks the door inside it.
     * A native <dialog> brings its own focus trap, backdrop and Esc.
     */
    const $dialog = $("<dialog>", {
      class: `place-dialog ${styles.dialog}`,
      "aria-labelledby": `${boardId}-place-title`,
      // Read out with the title, so a screen reader hears the warnings before the buttons.
      "aria-describedby": `${boardId}-place-subtitle ${boardId}-place-services ${boardId}-place-warnings`,
    });
    const $dialogTitle = $("<h2>", { class: styles.dialogTitle, id: `${boardId}-place-title` });
    const $dialogPhoto = $("<span>", { class: styles.dialogPhoto });
    const $dialogSubtitle = $("<p>", { class: styles.dialogSubtitle, id: `${boardId}-place-subtitle` });
    const $dialogServices = $("<p>", { class: styles.dialogServices, id: `${boardId}-place-services` });
    const $dialogNotes = $("<p>", { class: styles.dialogNotes });
    const $dialogLast = $("<p>", { class: styles.dialogLast });
    const $dialogAlternates = $("<p>", { class: styles.dialogLast });
    const $dialogSizing = $("<p>", { class: styles.dialogLast });
    const $dialogHousehold = $("<p>", { class: styles.dialogLast });
    // Reference, not the question at the counter: folded, so the destinations sit higher on a phone.
    const $dialogMore = $("<details>", { class: `disclosure ${styles.dialogMore}` })
      .append($("<summary>", { text: "More" }), $dialogAlternates, $dialogSizing, $dialogLast);
    const $dialogInShop = $("<p>", { class: styles.dialogLast });
    // Something to give the owner, not something to check: its label reads green.
    const $dialogOffer = $("<p>", { class: styles.dialogLast, "data-good": "" });
    const $dialogReward = $("<p>", { class: styles.dialogLast, "data-good": "" });
    // A refused placement reopens the dialog with the reason, so the next choice is one tap away.
    const $dialogError = $("<p>", { class: styles.dialogError, role: "alert" });
    const $dialogDone = $("<p>", { class: styles.dialogDone, role: "status" });
    const $dialogLink = $("<a>", { class: styles.dialogLink, text: "Open visit" });
    const $dialogWarnings = $("<div>", { class: styles.dialogAlerts, id: `${boardId}-place-warnings`, tabindex: -1 });
    // The visit itself, full width under who it is: the header stays the dog, the owner and the time.
    const $dialogVisit = $("<div>", { class: styles.dialogVisit });
    const $dialogBody = $("<div>", { class: styles.destinations });
    if (!destinations.length) {
      $dialogBody.append($("<p>", { class: styles.destinationsHint, text: "No active destinations. Add stations or kennels to assign pets." }));
    }
    for (const [kind, label] of [["kennel", "Kennels"], ["bath", "Bathing"], ["grooming", "Grooming"]]) {
      // Free ones first, taken ones after: what can be picked sits together, and the eye does not skip gaps.
      // Stable, so each half keeps the shop's own order.
      const choices = destinations.filter((destination) => destination.kind === kind)
        .sort((a, b) => Number(!!a.inUse) - Number(!!b.inUse));
      if (!choices.length) continue;
      const $group = $("<div>", { class: styles.destinationGroup, "data-kind": kind, "data-order": $dialogBody.children().length });
      // A group with a table in use says how many are left; a kennel bank holds several and says nothing.
      const busy = choices.filter((choice) => choice.inUse).length;
      $group.append($("<span>", { class: styles.destinationLabel, text: label, "data-kind": kind }).append(
        busy ? $("<span>", {
          class: styles.destinationFree, "data-full": busy === choices.length || undefined,
          text: busy === choices.length ? "All in use" : `${choices.length - busy} of ${choices.length} free`,
        }) : [],
      ));
      choices.forEach((destination, index) => $group.append($("<button>", {
        type: "button", class: `dest ${styles.dest}`, "data-value": destination.value, "data-order": index, text: destination.label,
        disabled: destination.inUse,
      }).append(destination.inUse || destination.note
        ? $("<span>", { class: styles.destNote, "data-tight": destination.tight || undefined, text: destination.inUse ? ["In use", destination.note].filter(Boolean).join(" · ") : destination.note })
              // Clipped to one line in CSS: the tooltip keeps the whole of it.
              .attr("title", function (this: HTMLElement) { return this.textContent ?? ""; })
        : [])));
      $dialogBody.append($group);
    }
    $dialog.append(
      // Who, then what to watch for, then where: the order the counter asks in.
      $("<header>", { class: styles.dialogHeader }).append(
        $dialogPhoto,
        // Who is at the desk (owner, their other dogs, who else may collect), then the groom itself.
        $("<div>", { class: styles.dialogHeading }).append($dialogTitle, $dialogSubtitle),
        $dialogLink,
      ),
      // What was booked, then a hairline, then what to mention to the owner.
      $dialogVisit.append($dialogServices, $dialogNotes, $("<div>", { class: styles.dialogAside }).append($dialogOffer, $dialogReward, $dialogHousehold, $dialogInShop, $dialogMore)),
      $dialogWarnings,
      $dialogDone,
      $dialogError,
      $dialogBody,
      $("<button>", { type: "button", class: `cancel ${styles.cancel}`, text: "Cancel" })
    );

    const closeDialog = () => {
      const element = $dialog[0] as HTMLDialogElement;
      if (typeof element.close === "function") element.close();
      else element.removeAttribute("open");
    };
    // Counted from now: the owner asks at the counter, not at booking. Up to the next five minutes,
    // since "around 11:37" promises a precision the estimate does not have; past closing is said
    // while the owner can still be asked how they want to collect.
    const readyFrom = (bookedMins?: number | null) => {
      const at = bookedMins ? Math.ceil((Date.now() + bookedMins * 60_000) / 300_000) * 300_000 : 0;
      const afterClose = Boolean(at && closesAt && at > closesAt);
      return { afterClose, ready: at ? `ready around ${formatShopTime(new Date(at), timeZone)}${afterClose ? ", after closing" : ""}` : "" };
    };
    const openDialog = (id: string, name: string) => {
      const arrival = (arrivals ?? NO_ARRIVALS).find((entry) => entry.id === id);
      const pet = arrival ? undefined : pets.find((entry) => entry.id === id);
      // The dog is the headline; the verb is a quiet lead-in to it.
      $dialogTitle.empty().append(
        $("<span>", { class: styles.dialogVerb, text: arrival ? "Check in " : "Place " }),
        document.createTextNode(name),
      );
      // Whose dog this is, so the counter can check it against who is standing there.
      const owner = arrival?.ownerName ?? pet?.ownerName;
      // The time keeps the card's colour, so a late arrival still reads as late once the dialog covers the card.
      $dialogSubtitle.text(owner ?? "");
      if (arrival) {
        // The breed first: the counter matches the dog on the lead to the name before the owner to the file.
        $dialogSubtitle.text([arrival.breed?.trim(), owner].filter(Boolean).map((part) => `${part} · `).join("")).append(
          $("<span>", { class: styles.dialogTime, "data-severity": worstSeverity(arrival.flags), text: arrival.arrivalTime + (() => {
            // Minutes either side of the booking, only while they say something: close ahead, or behind.
            const off = arrival.scheduledAt ? Math.round((Date.now() - arrival.scheduledAt) / 60000) : 0;
            // Past the hour it reads in hours: "95 min" is arithmetic the counter should not have to do.
            const span = (mins: number) => mins >= 60 ? `${Math.floor(mins / 60)} h${mins % 60 ? ` ${mins % 60} min` : ""}` : `${mins} min`;
            // An owner an hour or more ahead of the booking is early, not "in" anything: the slot may not be ready.
            return off > 5 ? ` (${span(off)} late)` : off <= -60 ? ` (${span(-off)} early)` : off < 0 ? ` (in ${-off} min)` : "";
          })() }),
          document.createTextNode(" · "),
          // Nobody's pet yet is said in colour: the counter is the last place it is cheap to settle.
          $("<span>", { class: styles.dialogAssignee, "data-none": arrival.assignedTo === "Unassigned" || undefined, text: assignee(arrival.assignedTo) }),
        );
      }
      const phone = arrival?.ownerPhone?.trim();
      if (phone) {
        $dialogSubtitle.append(document.createTextNode(" · "), $("<a>", { href: `tel:${phone.replace(/[^\d+]/g, "")}`, text: phone }));
      }
      const { ready, afterClose } = readyFrom(arrival?.bookedMins);
      $dialogServices.text(arrival?.services ?? "");
      // Quieter than what was booked: it is an estimate the counter reads out, not the order.
      if (ready) $dialogServices.append(arrival?.services ? document.createTextNode(" · ") : [], $("<span>", { class: styles.dialogReady, "data-late": afterClose || undefined, text: ready }));
      $dialogError.text("");
      $dialogDone.text("");
      $dialogNotes.text(arrival?.visitNotes?.trim() ?? "");
      // Each line leads with what it is in ink, so the eye runs down the labels and stops on the one it wants.
      const labelled = ($line: JQuery<HTMLElement>, key: string, value?: string | null) => $line.empty()
        .append(value ? [$("<span>", { class: styles.dialogKey, text: `${key}: ` }), document.createTextNode(value)] : []);
      labelled($dialogLast, "Last time", arrival?.lastGroom);
      labelled($dialogOffer, "Offer", arrival?.offer);
      labelled($dialogReward, "Reward ready", arrival?.reward);
      // Which dog and what the visit costs, on one line; the rate is labelled like the lines around it.
      $dialogSizing.text(arrival?.sizing ?? "");
      if (arrival?.rate) {
        $dialogSizing.append(arrival.sizing ? document.createTextNode(" · ") : [],
          $("<span>", { class: styles.dialogKey, text: "Rate: " }), document.createTextNode(arrival.rate));
      }
      labelled($dialogInShop, "Already here", arrival?.inShop?.join(", "));
      labelled($dialogAlternates, "Also approved", arrival?.alternates?.join(", "));
      // Each name opens that pet's check-in in place, so one owner's dogs go through in a row.
      $dialogHousehold.empty();
      if (arrival?.household?.length) {
        $dialogHousehold.append($("<span>", { class: styles.dialogKey, text: "Also due today: " }), ...arrival.household.map((other, index) => {
          // A later time says that dog is not at the desk yet; the same time goes unsaid.
          const time = (arrivals ?? NO_ARRIVALS).find((entry) => entry.id === other.id)?.arrivalTime;
          return [
            index ? document.createTextNode(", ") : [],
            $("<button>", { type: "button", class: styles.sibling, "data-id": other.id, "data-name": other.name, text: other.name }),
            time && time !== arrival.arrivalTime ? document.createTextNode(` (${time})`) : [],
          ];
        }).flat());
      }
      // Shut on every open, and gone when there is nothing in it.
      // The fold names what it holds, so nobody opens it to find out.
      const folded = [[$dialogAlternates, "Also approved"], [$dialogSizing, "Size"], [$dialogLast, "Last time"]] as const;
      const held = folded.filter(([$line]) => $line.text()).map(([, name]) => name);
      $dialogMore.prop("open", false).prop("hidden", !held.length).children("summary").text(`More · ${held.join(", ")}`);
      // Nothing booked, noted or held is no band at all.
      $dialogVisit.prop("hidden", !held.length && !$dialogVisit.find("p").text());
      $dialogLink.attr("href", `/staff/appointments/${id}`);
      const photo = arrival?.petPhotoUrl ?? pet?.petPhotoUrl;
      // The same face as the card that opened it: the photo, or the initial.
      $dialogPhoto.empty().append(avatar(name, photo, (arrival ?? pet)?.hasBiteHistory));
      $dialogBody.find(`.${styles.destinationLabel}[data-kind="kennel"]`).text(arrival?.needsKennel ? "Kennels · booked with a kennel"
        // Says why the doors lead for a dog not booked with one.
        : arrival?.scheduledAt && arrival.scheduledAt - Date.now() > DUE_WITHIN_MS ? "Kennels · early, waits here first" : "Kennels");
      // Nothing to say is nothing drawn: a pet with a clean record gets the
      // plain list of destinations.
      const bite = (arrival ?? pet)?.hasBiteHistory;
      const vet = (arrival ?? pet)?.vet;
      const warnings = [
        ...((arrival ?? pet)?.checkInWarnings ?? []),
        ...(arrival?.firstVisit ? [{ label: "First visit: no groom on record", severity: "info" as const }] : []),
      ]
        .sort((a, b) => SEVERITY_ORDER[a.severity] - SEVERITY_ORDER[b.severity]);
      $dialogWarnings.empty().append(
        bite ? $("<p>", { class: `bite-warning ${styles.dialogBite}`, text: "⚠ Bite history" }) : [],
        warnings.length
          ? $("<ul>", { class: styles.dialogWarnings, "aria-label": `Before handling ${name}` }).append(
              warnings.map((entry) => $("<li>", { "data-severity": entry.severity }).append(
                entry.severity === "critical" ? $("<span>", { class: "sr-only", text: "Urgent: " }) : [],
                // A text node: jQuery parses a bare string as HTML, and these are typed notes.
                document.createTextNode(entry.label),
              ))
            )
          : [],
        vet ? $("<p>", { class: styles.dialogVet }).append(
          $("<span>", { text: vet.name ? `Vet: ${vet.name}` : "Vet" }),
          vet.phone ? $("<a>", { href: `tel:${vet.phone.replace(/[^\d+]/g, "")}`, text: vet.phone }) : [],
        ) : [],
      );
      $dialog.attr("data-id", id).attr("data-name", name);
      const element = $dialog[0] as HTMLDialogElement;
      // Already open when switching to another pet from the same home.
      if (!element.open) {
        if (typeof element.showModal === "function") element.showModal();
        else element.setAttribute("open", "");
      }
      // A red warning takes the focus, so Enter cannot check a pet in past it.
      const stop = bite || warnings.some((entry) => entry.severity === "critical");
      $dialog.attr("data-stop", stop ? "" : null);
      const $dests = $dialog.find(".dest").removeAttr("data-suggested data-reason");
      const $suggested = arrival?.suggested ? $dests.filter((_, el) => el.dataset.value === arrival.suggested) : $();
      $suggested.attr("data-suggested", "").attr("data-reason", arrival?.suggestedReason || null);
      const $free = $dests.not(":disabled");
      // Every button dashed says "no" nine times; one line says it once, above them.
      $dialogBody.children("[data-all-busy]").remove();
      if ($dests.length && !$free.length) $dialogBody.prepend($("<p>", {
        class: styles.destinationsHint, "data-all-busy": "", role: "status", text: "Nothing is free right now. Move a pet on, then check this one in." + (() => {
          const soonest = destinations.filter((entry) => entry.freesAt).sort((a, b) => a.freesAt! - b.freesAt!)[0];
          return soonest?.freesAt ? ` ${soonest.label} should be done around ${formatShopTime(new Date(soonest.freesAt), timeZone)}.` : "";
        })(),
      }));
      const $lead = $suggested.not(":disabled");
      // The booked choice's group leads, in the DOM and so in the tab order; the rest keep theirs.
      const $groups = $dialogBody.children(`.${styles.destinationGroup}`);
      // A pet booked without a kennel is going to the bath, so the doors drop to the end for it.
      const rank = (group: HTMLElement) => ($lead.length && group.contains($lead[0]) ? -1
        : Number(group.dataset.order) + (arrival && !arrival.needsKennel && group.dataset.kind === "kennel"
          // …unless it came in well ahead of its slot: then it waits behind a door first, so the doors come first.
          ? (arrival.scheduledAt && arrival.scheduledAt - Date.now() > DUE_WITHIN_MS ? -10 : 10) : 0));
      $dialogBody.append($groups.get().sort((a, b) => rank(a) - rank(b)));
      // …and inside it the booked choice comes first; every other pet gets the group back in its own order.
      $groups.each((_, group) => {
        const $buttons = $(group).children(".dest");
        $(group).append($buttons.get().sort((a, b) =>
          (a === $lead[0] ? -1 : Number(a.dataset.order)) - (b === $lead[0] ? -1 : Number(b.dataset.order))));
      });
      // The first nine free choices answer to their number, in the order just drawn.
      $dests.removeAttr("aria-keyshortcuts").children(`.${styles.destKey}`).remove();
      $dialog.find(".dest:not(:disabled)").slice(0, 9).each((index, el) => {
        $(el).attr("aria-keyshortcuts", String(index + 1))
          .append($("<kbd>", { class: styles.destKey, "aria-hidden": "true", text: index + 1 }));
      });
      // With nothing free, the way out takes the focus rather than the browser's pick.
      (stop ? $dialogWarnings : $lead.length ? $lead : $free.length ? $free.first() : $dialog.find(".cancel")).trigger("focus");
    };
    const icon = (d: string, stroked = false) => {
      const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
      svg.setAttribute("viewBox", "0 0 16 16");
      svg.setAttribute("width", "14");
      svg.setAttribute("height", "14");
      svg.setAttribute("aria-hidden", "true");
      if (stroked) {
        svg.setAttribute("fill", "none");
        svg.setAttribute("stroke", "currentColor");
        svg.setAttribute("stroke-width", "1.6");
        svg.setAttribute("stroke-linecap", "round");
        svg.setAttribute("stroke-linejoin", "round");
      } else {
        svg.setAttribute("fill", "currentColor");
      }
      const path = document.createElementNS("http://www.w3.org/2000/svg", "path");
      path.setAttribute("d", d);
      svg.appendChild(path);
      return svg;
    };
    // Icon only: the name stays on the button for screen readers and as the
    // hover tooltip.
    const pickButton = (id: string, name: string, label = "Place this pet") => $("<button>", {
      type: "button", class: `pick ${styles.pick}`, "data-id": id, "data-name": name,
      "aria-label": label, title: label, "aria-haspopup": "dialog",
    }).append(icon(PLACE_PATH, true));

    /*
     * Every alert on a pet folds into one flag in the card's corner, coloured
     * by the worst of them. A native <details> with a floating bubble takes focus and
     * announces its state without any of it being rebuilt here.
     */
    const flag = (name: string, flags: BoardFlag[] = []) => {
      if (!flags.length) return [];
      const sorted = [...flags].sort((a, b) => SEVERITY_ORDER[a.severity] - SEVERITY_ORDER[b.severity]);
      const svg = icon(FLAG_PATH);
      return $("<details>", { class: styles.flag, "data-severity": worstSeverity(flags) }).append(
        $("<summary>", { class: styles.flagToggle }).append(
          svg,
          $("<span>", { class: "sr-only", text: `Alerts for ${name}` }),
          sorted.length > 1 ? $("<span>", { "aria-hidden": "true", text: String(sorted.length) }) : [],
        ),
        $("<ul>", { class: styles.flagList }).append(sorted.map((entry) =>
          $("<li>", { "data-severity": entry.severity }).append($("<strong>", { text: entry.label }))
        )),
      );
    };

    // One mark for every kind of card, so a pending arrival and a pet on the
    // floor carry the same warning in the same place.
    const assignee = (name: string) => (name === "Unassigned" ? name : `with ${name}`);
    const biteMark = (bite?: boolean) => bite
      ? $("<span>", { class: styles.biteIndicator }).append(
          $('<svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M10.3 3.9 2.1 18.1A2 2 0 0 0 3.8 21h16.4a2 2 0 0 0 1.7-2.9L13.7 3.9a2 2 0 0 0-3.4 0Z"/><path d="M12 9v4m0 4h.01"/></svg>'),
          $("<span>", { class: styles.biteExplanation, text: "Bite history recorded" })
        )
      : [];

    // A red ring round the face, on every card and in the dialog: what the hands must know before they reach for the dog.
    const avatar = (petName: string, url?: string | null, bites?: boolean) => {
      const $avatar = $("<span>", {
        class: `profile-avatar ${styles.avatar}`,
        "aria-hidden": "true",
        "data-bite": bites ? "" : undefined,
        text: petName.trim().charAt(0).toUpperCase(),
      });
      if (url) {
        const $photo = $("<img>", {
          alt: "",
          width: 40,
          height: 40,
          loading: "lazy",
          draggable: false,
          class: "h-full w-full object-cover",
        }).on("error", () => {
          $avatar.text(petName.trim().charAt(0).toUpperCase());
        });
        $avatar.empty().append($photo);
        $photo.attr("src", url);
      }
      return $avatar;
    };

    const chip = (pet: BoardPet) => {
      const $avatar = avatar(pet.petName, pet.petPhotoUrl, pet.hasBiteHistory);

      return $("<button>", {
        type: "button",
        "data-id": pet.id,
        "data-name": pet.petName,
        class:
          `chip ${styles.pet}`,
        "aria-pressed": "false",
        title: `${pet.petName} · ${pet.ownerName}${pet.stationName ? ` · ${pet.stationName}` : ""}${pet.kennelName ? ` · ${pet.kennelName}` : ""}. Tap, then choose Move here on a stage.`,
      }).append(
        $("<span>", { class: "flex items-center gap-2" }).append(
          $avatar,
          $("<span>", { class: "min-w-0 flex-1" }).append(
            $("<span>", { class: styles.petName, text: pet.petName }).append(biteMark(pet.hasBiteHistory)),
            $("<span>", { class: styles.owner, text: pet.ownerName })
          )
        ),
        // Where it is standing, on one quiet line: the station is a detail of
        // the chip, not a column of its own.
        [pet.stationName, pet.kennelName, pet.pickupNote].some(Boolean)
          ? $("<span>", {
              class: styles.location,
              text: [pet.stationName, pet.kennelName, pet.pickupNote].filter(Boolean).join(" · "),
            })
          : []
      );
    };

    const column = (key: string, name: string, hint: string) => {
      const $list = $("<ul>", { class: `stage-list ${styles.list}`, "data-column": key });
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
          $("<h3>", { class: styles.stageName, text: name, title: hint }),
          $("<p>", { class: `occupancy ${styles.occupancy}` }),
        ),
        $("<div>", { class: styles.meter, "aria-hidden": "true", hidden: !capacity[key] }).append($("<span>", { class: "meter-fill" })),
        $list,
        $place
      );
    };

    // A stage with a flagged pet says so on its tab, so nothing hides behind one.
    const flagged = (key: string) => key === "arrivals"
      ? (arrivals ?? NO_ARRIVALS).some((arrival) => arrival.flags?.length)
      : pets.some((pet) => pet.columnKey === key && pet.flags?.length);
    const $strip = $("<div>", { class: styles.stages });
    const $tabs = $("<div>", { class: styles.tabs, role: "tablist", "aria-label": "Service stages" });
    const $selection = $("<p>", { class: styles.selection, hidden: true, "aria-live": "polite" });
    $strip.append($tabs, $selection);
    const activate = (key: string, focus = false) => {
      $root.find(`.${styles.flag}[open]`).removeAttr("open");
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
    stages.forEach((entry) => {
      const room = capacity[entry.key];
      const hint = room
        ? `${entry.label}: ${room.used} of ${room.capacity} in use`
        // Arrivals are not a stage yet: the heading says what the list is.
        : entry.key === "arrivals" ? `${entry.label}: booked today, not checked in yet`
        : `${entry.label}: pets at this stage`;
      $tabs.append($("<button>", {
        type: "button", role: "tab", class: styles.tab,
        id: `${boardId}-tab-${entry.key}`,
        "aria-controls": `${boardId}-panel-${entry.key}`,
        "data-column": entry.key,
        "data-stage": entry.key,
        "aria-label": entry.label,
      }).append(
        $("<span>", { class: styles.tabLabel, text: entry.label }),
        $("<span>", { class: `tab-count ${styles.tabCount}`, "aria-hidden": "true" }),
        ...(flagged(entry.key) ? [$("<span>", { class: styles.alertDot, "aria-hidden": "true" })] : []),
      ));
      const $panel = column(entry.key, entry.label, hint);
      if (entry.key === "arrivals") {
        $panel.find(".stage-list").removeClass("stage-list").addClass("arrivals-list");
        $panel.find(".place").remove();
        $panel.find(`.${styles.meter}`).remove();
        const $list = $panel.find(".arrivals-list");
        (arrivals ?? NO_ARRIVALS).forEach((arrival) => $list.append($("<li>", {
          class: styles.assignable,
          // Booked over an hour out: recessed, so the pets due now stand forward.
          ...(arrival.scheduledAt && arrival.scheduledAt - Date.now() > DUE_WITHIN_MS ? { "data-later": "" } : {}),
          // What the search reads: names — the owner's and whoever they approved, since a partner
          // at the desk gives their own — the breed, and the phone as bare digits so any spacing finds it.
          "data-find": [arrival.petName, arrival.ownerName ?? "", arrival.breed ?? "", ...(arrival.alternates ?? []), (arrival.ownerPhone ?? "").replace(/\D/g, "")].map(fold).join(" "),
        }).append(
          $("<a>", {
            href: `/staff/appointments/${arrival.id}`,
            class: `${styles.pet} ${styles.arrival}`,
            // Says what a tap does, now that a tap checks in rather than opening the visit.
            title: assign ? `Check in ${arrival.petName}` : [arrival.petName, arrival.ownerName].filter(Boolean).join(" · "),
          }).append(
            // The time takes the colour of the card's worst flag, so a late pet reads as late at a glance.
            $("<span>", {
              class: styles.arrivalTime,
              text: arrival.arrivalTime,
              "data-severity": worstSeverity(arrival.flags),
            }),
            $("<span>", { class: "flex items-center gap-2" }).append(
              avatar(arrival.petName, arrival.petPhotoUrl, arrival.hasBiteHistory),
              $("<span>", { class: "min-w-0 flex-1" }).append(
                $("<span>", { class: styles.petName, text: arrival.petName }).append(biteMark(arrival.hasBiteHistory)),
                // Its own title: the card's now says what a tap does, and a long name is cut to one line.
                arrival.ownerName ? $("<span>", { class: styles.owner, text: arrival.ownerName, title: arrival.ownerName }) : [],
              ),
            ),
            // One quiet line under the pet, the same shape as a chip's location line.
            $("<span>", { class: styles.location }).append(...[
                // A first visit wants the intake questions, so it reads first and in colour.
                arrival.firstVisit && $("<span>", { class: styles.firstVisit, text: "First visit" }),
                // Nobody's pet yet, in the same amber as the dialog: seen before the owner reaches the desk.
                $("<span>", { class: styles.dialogAssignee, "data-none": arrival.assignedTo === "Unassigned" || undefined, text: assignee(arrival.assignedTo) }),
                // Booked with a kennel: the counter plans a door before the owner is at the desk.
                arrival.needsKennel && "Kennel",
                // A reward to hand over is planned before the owner reaches the desk, like the kennel.
                // Green, as in the dialog: something to hand over, not something wrong.
                arrival.reward && $("<span>", { class: styles.rewardReady, text: "Reward ready" }),
                // Dogs that come in together read as together from the card.
                arrival.household?.length && `+ ${arrival.household.map((other) => other.name).join(", ")}`,
                // A dog from this home is already on the floor: its door may be this one's too.
                arrival.inShop?.length && "Family here",
                arrival.note,
              ].filter((part): part is string | JQuery<HTMLElement> => Boolean(part)).flatMap((part, index) => [
                ...(index ? [document.createTextNode(" · ")] : []),
                typeof part === "string" ? document.createTextNode(part) : part,
              ])).attr("title", function (this: HTMLElement) { return this.textContent ?? ""; }),
          ),
          flag(arrival.petName, arrival.flags),
          ...(assign ? [pickButton(arrival.id, arrival.petName, `Check in ${arrival.petName}`)] : []),
        )));
        if (!arrivals?.length) $list.append($("<li>", { class: styles.empty, text: "No more arrivals scheduled today." }));
        // A busy morning is found by name, not by scrolling; a short list needs no box.
        if ((arrivals?.length ?? 0) > FIND_AFTER) {
          // One card, or several that are all one household's dogs.
          const oneHome = ($picks: JQuery<HTMLElement>) => {
            const ids = $picks.get().map((pick) => pick.dataset.id);
            const first = arrivals?.find((entry) => entry.id === ids[0]);
            return ids.length > 0 && ids.slice(1).every((id) => first?.household?.some((other) => other.id === id));
          };
          // Up and down walk the check-in buttons of the cards still showing; up from the first returns to the box.
          $list.on("keydown", ".pick", (event) => {
            const step = { ArrowDown: 1, ArrowUp: -1 }[event.key];
            if (!step) return;
            const $picks = $list.children("li").filter((_, item) => item.style.display !== "none").find(".pick");
            const at = $picks.index(event.currentTarget) + step;
            event.preventDefault();
            (at < 0 ? $list.parent().find(`.${styles.find}`) : $picks.eq(Math.min(at, $picks.length - 1))).trigger("focus");
          });
          const $missing = $("<p>", { class: styles.findEmpty, role: "status" });
          // Under the box rather than the list: on a long morning the list runs off the screen.
          $list.before($missing);
          $missing.before($("<input>", {
            type: "search", class: styles.find, placeholder: "Find a pet, owner or phone", "aria-label": "Find an arrival", "aria-keyshortcuts": "/",
            // A phone keyboard neither "corrects" a surname nor offers yesterday's search, and its key says Enter opens.
            autocomplete: "off", autocorrect: "off", spellcheck: "false", enterkeyhint: "go",
          }).on("input", (event) => {
            const query = fold(String($(event.currentTarget).val()).trim());
            // "555-01" and "55501" are the same number; three digits before it is worth reading as one.
            const digits = query.replace(/\D/g, "");
            const needle = digits.length >= 3 && !/[a-z]/.test(query) ? digits : query;
            $list.children("li").each((_, item) => {
              // Inline, because the card's own display rule outranks [hidden].
              $(item).toggle(!needle || (item.dataset.find ?? "").includes(needle));
            });
            // A search that empties the list says so, rather than leaving a blank grid.
            const $shown = $list.children("li").filter((_, item) => item.style.display !== "none");
            $missing.text($shown.length ? "" : `No arrival today matches that ${needle === digits ? "number" : "name"}.`).removeAttr("data-done");
            // Someone at the desk with no booking: the same words find their file for a walk-in.
            if (!$shown.length) $missing.append(" ", $("<a>", { href: `/staff/customers?q=${encodeURIComponent(query)}`, text: "Search all customers" }));
            // The one card Enter would open wears the hover ring, so the key's effect is visible first.
            $list.children("li").removeAttr("data-only");
            const only = needle && oneHome($shown.find(".pick"));
            if (only) $shown.first().attr("data-only", "");
            // Read out as well as ringed: how far the list narrowed, and what Enter will do.
            if (needle && $shown.length) {
              $missing.text(`${$shown.length} of ${$list.children("li").length} arrivals${only ? ` · Enter checks in ${$shown.find(".pick").first().attr("data-name")}` : ""}`);
            }
          }).on("keydown", (event) => {
            // Esc empties the box in every browser, not only the ones whose search field does it natively.
            if (event.key === "Escape" && $(event.currentTarget).val()) {
              event.preventDefault();
              $(event.currentTarget).val("").trigger("input");
              return;
            }
            // Down steps from the box onto the first card's check-in button (Enter on the card itself opens the visit).
            if (event.key === "ArrowDown") {
              const $first = $list.children("li").filter((_, item) => item.style.display !== "none").first().find(".pick");
              if ($first.length) { event.preventDefault(); $first.trigger("focus"); }
              return;
            }
            // One match left: Enter opens its check-in, the name typed was the whole search.
            if (event.key !== "Enter") return;
            const $picks = $list.children("li").filter((_, item) => item.style.display !== "none").find(".pick");
            // An owner's surname finds all their dogs: the first opens, and the household hand-off brings the rest.
            if (oneHome($picks)) { event.preventDefault(); $picks.first().trigger("click"); }
          }));
        }

      }
      $strip.append($panel);
    });
    $root.append($strip);
    activate(activeStage.current);

    pets.forEach((pet) => {
      $strip.find(`.stage-list[data-column="${pet.columnKey}"]`).append($("<li>", { class: styles.assignable }).append(
        chip(pet),
        flag(pet.petName, pet.flags),
        ...(assign && pet.columnKey === "waiting" ? [pickButton(pet.id, pet.petName)] : []),
      ).attr("data-placed", pet.id === justPlaced.current ? "" : null));
    });
    if (pets.some((pet) => pet.id === justPlaced.current)) justPlaced.current = null;
    $root.append($dialog);

    // Refresh counts, station occupancy, and empty states after each move.
    const paint = () => {
      $strip.find(".col").each((_, element) => {
        const $col = $(element);
        const key = String($col.attr("data-stage"));
        const held = key === "arrivals" ? arrivals?.length ?? 0 : $col.find(".chip").length;
        const room = capacity[key];
        $tabs.find(`[data-column="${key}"]`).attr("aria-label", `${stages.find((entry) => entry.key === key)?.label}, ${held} pets${flagged(key) ? ", has alerts" : ""}`).find(".tab-count").text(String(held));
        // The rest of the day recedes on the cards; the count says how many are the next hour's.
        const soon = (arrivals ?? NO_ARRIVALS).filter((arrival) => !arrival.scheduledAt || arrival.scheduledAt - Date.now() <= DUE_WITHIN_MS).length;
        $col.find(".occupancy").text(key === "arrivals" ? `${held} awaiting check-in${soon < held ? ` · ${soon} due within the hour` : ""} · On arrival, check in to a station or kennel` : room
          ? `${held} of ${room.capacity} stations occupied`
          : STAGE_DESCRIPTIONS[key]);
        $col.find(".meter-fill").css("width", room && room.capacity > 0 ? `${Math.min(100, held / room.capacity * 100)}%` : "0%");
        $col.find(".empty-state").remove();
        if (!held) $col.find(".stage-list").append($("<li>", {
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
      const name = $chip?.attr("data-name");
      $selection.prop("hidden", !$chip).text(name ? `${name} selected. Choose a destination below, or open a stage tab and choose Move here. Press Esc to cancel.` : "");
    };

    let moving = false;
    const moveChip = async ($chip: JQuery<HTMLElement>, columnKey: string) => {
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
      $chip.closest("li").appendTo($strip.find(`.stage-list[data-column="${columnKey}"]`));
      select(null);
      paint();
      activate(columnKey, true);
      // The station written on the chip is decided by the server, so the chip
      // is only right again after this.
      router.refresh();
    };

    const place = (id: string, name: string, destination: string) => {
      if (!assign || moving || !destination) return;
      moving = true;
      closeDialog();
      setNote("");
      void (async () => {
        // The card that was placed stays dimmed and inert until the server
        // answers, so a second tap cannot place it twice.
        const $card = $strip.find(`.pick[data-id="${CSS.escape(id)}"]`).closest("li").addClass(styles.pending).attr("aria-busy", "true");
        try {
          const result = await assign(id, destination);
          if (!result.ok) {
            $card.removeClass(styles.pending).removeAttr("aria-busy");
            // The board is stale until the next refresh; the refused choice is
            // not offered again meanwhile, so the obvious retry is not a second refusal.
            $dialogBody.find(`.dest[data-value="${CSS.escape(destination)}"]`).prop("disabled", true)
              .find(`.${styles.destNote}`).remove().end()
              .append($("<span>", { class: styles.destNote, text: "Unavailable" }));
            openDialog(id, name);
            $dialogError.text(result.error ?? "Could not assign this pet.");
            return;
          }
          // A bank names its door only once the server has picked one.
          const label = result.placedAt || destinations.find((entry) => entry.value === destination)?.label || "destination";
          // Dogs booked together arrive together: the next one's check-in follows on its own.
          const done = arrivals?.find((arrival) => arrival.id === id);
          const sibling = done?.household?.find((other) =>
            arrivals?.find((arrival) => arrival.id === other.id)?.arrivalTime === done.arrivalTime);
          // The estimate the counter just read out stays in view for the owner still at the desk.
          const { ready } = readyFrom(done?.bookedMins);
          const said = `${name} checked in at ${label}${ready ? ` · ${ready}` : ""}`;
          nextUp.current = sibling ? { id: sibling.id, done: said } : null;
          findAgain.current = root.querySelector<HTMLInputElement>(`.${styles.find}`)?.value.trim() ? said : null;
          setAnnouncement((arrivals ?? NO_ARRIVALS).some((arrival) => arrival.id === id)
            ? `${name} checked in and assigned to ${label}`
            : `${name} assigned to ${label}`);
          justPlaced.current = id;
          select(null);
          // A household still at the desk, or a queue being worked by search, keeps the board on Pending.
          if (result.columnKey && !sibling && !findAgain.current) activate(result.columnKey, true);
          router.refresh();
        } catch {
          $card.removeClass(styles.pending).removeAttr("aria-busy");
          setNote("Could not assign this pet. Refresh to check its current placement before trying again.");
        } finally {
          moving = false;
        }
      })();
    };

    $strip
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
      .on("keydown", (event) => {
        if (event.key === "Escape") select(null);
      })
      .on("click", ".chip", (event) =>
        select(selected?.is(event.currentTarget) ? null : $(event.currentTarget))
      )
      .on("click", ".pick", (event) => {
        const $button = $(event.currentTarget);
        openDialog(String($button.attr("data-id")), String($button.attr("data-name")));
      })
      // At the counter a tap on the card is a check-in, not a trip to the visit page (the dialog links
      // there). A modified click still opens the link, and keyboard Enter (detail 0) follows it as announced.
      .on("click", `.${styles.arrival}`, (event) => {
        if (!assign || !event.detail || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
        event.preventDefault();
        $(event.currentTarget).closest("li").find(".pick").trigger("click");
      })
      .on("click", ".place", (event) => {
        if (selected) void moveChip(selected, String($(event.currentTarget).attr("data-column")));
      });

    $dialog
      .on("click", ".dest", (event) => place(
        String($dialog.attr("data-id")), String($dialog.attr("data-name")),
        String($(event.currentTarget).attr("data-value"))
      ))
      .on("click", `.${styles.sibling}`, (event) => {
        const $button = $(event.currentTarget);
        openDialog(String($button.attr("data-id")), String($button.attr("data-name")));
      })
      // Arrows walk the free destinations in reading order, so a keyboard at the counter
      // does not Tab through every in-use table to reach the next one.
      .on("keydown", ".dest", (event) => {
        const step = { ArrowRight: 1, ArrowDown: 1, ArrowLeft: -1, ArrowUp: -1 }[event.key];
        if (!step) return;
        const $free = $dialog.find(".dest:not(:disabled)");
        const at = $free.index(event.currentTarget);
        event.preventDefault();
        $free.eq((at + step + $free.length) % $free.length).trigger("focus");
      })
      // A number picks that choice: the counter's other hand is on the lead, not aiming a pointer.
      // Not from the warnings a red dialog opens on, so a stray key cannot place a pet past them.
      .on("keydown", (event) => {
        if (!/^[1-9]$/.test(event.key) || event.metaKey || event.ctrlKey || event.altKey
          || $(event.target).is("input, textarea") || event.target === $dialogWarnings[0]) return;
        const $pick = $dialog.find(".dest:not(:disabled)").eq(Number(event.key) - 1);
        if ($pick.length) { event.preventDefault(); $pick.trigger("click"); }
      })
      // Enter on the warnings a red dialog opens on is "read it": the booked choice takes the focus,
      // so the next Enter places the pet and neither key can skip the read.
      .on("keydown", `.${styles.dialogAlerts}`, (event) => {
        if (event.key !== "Enter" || event.target !== $dialogWarnings[0]) return;
        event.preventDefault();
        $dialog.find(".dest:not(:disabled)").first().trigger("focus");
      })
      .on("click", ".cancel", closeDialog)
      // A click on the dimmed page behind closes it. The dialog carries its own
      // padding, so the target alone cannot tell padding from backdrop.
      .on("click", (event) => {
        if (event.target !== $dialog[0]) return;
        const box = $dialog[0].getBoundingClientRect();
        const { clientX: x, clientY: y } = event;
        if (x < box.left || x > box.right || y < box.top || y > box.bottom) closeDialog();
      });

    const openArrivals = () => {
      if (arrivals && window.location.hash === "#arrivals") activate("arrivals");
    };
    const onArrivalLink = (event: MouseEvent) => {
      if (arrivals && event.target instanceof Element && event.target.closest('a[href="#arrivals"]')) activate("arrivals", true);
    };
    const $find = $root.find(`.${styles.find}`);
    if (query.current && $find.length && !findAgain.current) {
      $find.val(query.current.value).trigger("input");
      if (query.current.focused) $find.trigger("focus");
    }
    query.current = null;
    if (!initialized.current) {
      openArrivals();
      initialized.current = true;
    }
    const next = nextUp.current ? arrivals?.find((arrival) => arrival.id === nextUp.current?.id) : undefined;
    if (next) {
      // The dialog that opened itself says why: the last dog went where it was sent.
      const { done } = nextUp.current!;
      nextUp.current = null;
      openDialog(next.id, next.petName);
      $dialogDone.text(done);
    } else if (reopen.current) {
      const { id, name, more } = reopen.current;
      reopen.current = null;
      // Only while the pet is still where it was: one placed from another screen has nothing left to decide here.
      if ((arrivals ?? NO_ARRIVALS).some((arrival) => arrival.id === id) || pets.some((pet) => pet.id === id && pet.columnKey === "waiting")) {
        openDialog(id, name);
        // The fold stays as it was left, not shut by a refresh nobody asked for.
        if (!$dialogMore.prop("hidden")) $dialogMore.prop("open", more);
      }
    } else if (findAgain.current) {
      // The last one's result sits under the empty search until the next name is typed.
      $root.find(`.${styles.findEmpty}`).text(findAgain.current).attr("data-done", "");
      findAgain.current = null;
      root.querySelector<HTMLInputElement>(`.${styles.find}`)?.focus();
    }
    const dismissFlags = (event: MouseEvent | KeyboardEvent) => {
      if (event instanceof KeyboardEvent && event.key !== "Escape") return;
      $root.find(`.${styles.flag}[open]`).each((_, element) => {
        if (event instanceof MouseEvent && event.target instanceof Node && element.contains(event.target)) return;
        element.removeAttribute("open");
        if (event instanceof KeyboardEvent) element.querySelector("summary")?.focus();
      });
    };
    const positionFlags = () => {
      $root.find(`.${styles.flag}[open]`).each((_, element) => {
        const toggle = element.querySelector("summary");
        const bubble = element.querySelector("ul");
        if (!toggle || !bubble) return;
        const viewportTop = window.visualViewport?.offsetTop ?? 0;
        const spaceAbove = toggle.getBoundingClientRect().top - viewportTop;
        element.setAttribute("data-placement", spaceAbove >= bubble.getBoundingClientRect().height + 16 ? "above" : "below");
      });
    };
    // Toggle does not bubble; capture it so native mouse and keyboard opening
    // both measure the rendered alert content.
    root.addEventListener("toggle", positionFlags, true);
    window.addEventListener("resize", positionFlags);
    document.addEventListener("scroll", positionFlags, true);
    window.visualViewport?.addEventListener("resize", positionFlags);
    window.visualViewport?.addEventListener("scroll", positionFlags);
    document.addEventListener("click", dismissFlags);
    document.addEventListener("keydown", dismissFlags);
    // "/" from anywhere on a terminal opens Pending at its search, as it does on most sites with one.
    const focusFind = (event: KeyboardEvent) => {
      if (event.key !== "/" || event.metaKey || event.ctrlKey || event.altKey) return;
      if (event.target instanceof Element && event.target.closest("input, textarea, select, [contenteditable], dialog[open]")) return;
      const find = root.querySelector<HTMLInputElement>(`.${styles.find}`);
      if (!find) return;
      event.preventDefault();
      activate("arrivals");
      find.focus();
    };
    document.addEventListener("keydown", focusFind);
    window.addEventListener("hashchange", openArrivals);
    document.addEventListener("click", onArrivalLink);
    return () => {
      root.removeEventListener("toggle", positionFlags, true);
      window.removeEventListener("resize", positionFlags);
      document.removeEventListener("scroll", positionFlags, true);
      window.visualViewport?.removeEventListener("resize", positionFlags);
      window.visualViewport?.removeEventListener("scroll", positionFlags);
      document.removeEventListener("click", dismissFlags);
      document.removeEventListener("keydown", dismissFlags);
      document.removeEventListener("keydown", focusFind);
      window.removeEventListener("hashchange", openArrivals);
      document.removeEventListener("click", onArrivalLink);
      $strip.off();
      $dialog.off();
      const find = root.querySelector<HTMLInputElement>(`.${styles.find}`);
      query.current = find?.value ? { value: find.value, focused: document.activeElement === find } : null;
      reopen.current = $dialog.is("[open]") ? { id: String($dialog.attr("data-id")), name: String($dialog.attr("data-name")), more: $dialogMore.prop("open") } : null;
      $root.empty();
    };
  }, [pets, arrivals, destinations, assign, capacity, move, router, boardId, closesAt, timeZone]);

  return (
    <div className={styles.board} id={arrivals ? "arrivals" : undefined}>
      <div ref={rootRef} />
      <div className={styles.help}>
        <span>{arrivals ? "Check in arrivals to a station or kennel. " : ""}Select a checked-in pet, open a tab, and choose Move here.</span>
        <span>
          {/* Only once there is a search to jump to. */}
          {(arrivals?.length ?? 0) > FIND_AFTER && <><kbd>/</kbd> to find an arrival · </>}
          <kbd>Esc</kbd> to clear selection
        </span>
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
