import { prisma } from "@/lib/prisma";
import { formatShopDate, formatShopTime, shopDayKey, shopDayRange } from "@/lib/utils";
import { AppointmentStatus } from "@prisma/client";
import { isWorkStation } from "@/lib/stations";
import { floorRoster } from "@/lib/presence";
import { BOARD_COLUMNS, boardColumnForVisit, boardWaitingSince } from "@/lib/appointment-flow";
import FloorBoard, { type ColumnCapacity } from "@/components/FloorBoard";
import { assignLifecycleDestination } from "./lifecycle-actions";
import { moveToColumn } from "@/app/staff/appointments/actions";
import { serviceAlerts, type AlertSeverity } from "@/lib/alerts";
import { getConfig } from "@/lib/config";
import { rewardCards } from "@/lib/rewards";
import { formatCents } from "@/lib/pricing";
import { livePromotionsByService } from "@/lib/promotions";
import { isEnabled } from "@/lib/features";
import { FINISHED_STATUSES } from "@/lib/analytics";
import {
  VACCINE_LEVEL_LABEL,
  checksForPets,
  vaccinationBlockers,
  vaccinationRefusalMessage,
} from "@/lib/vaccinations";
import { photoUrl } from "@/lib/photos";
import styles from "./dashboard.module.css";
import { DashboardRefresh } from "@/components/DashboardRefresh";
import { PICKUP_LEVEL_LABEL, pickupWatchlist, type PickupLevel } from "@/lib/pickups";
import Link from "next/link";
import { groomRecordSummary, lastGroomRecordsForPets } from "@/lib/visit-record";
import { outstandingDocumentsFor } from "@/lib/documents";
import { sizeCutoffs, sizeForWeight, sizeName } from "@/lib/pet-size";
import { absenceNote, todaysShifts } from "@/lib/schedule";
import { DAY_KEYS, shopDayIndex, type BusinessHours } from "@/lib/shop-hours";
import { shopMoment } from "@/lib/shop-time";
import { petAge, timeSince } from "@/lib/ages";
import { PageShell, PageSection } from "@/components/ui";
import { joinPetNames, waitingOn } from "@/lib/visit-time";

// Screen readers announce the title first; without one every page in the
// app reads as the same document (WCAG 2.4.2).
export const metadata = { title: "Dashboard" };

// Keep detailed operations on their dedicated pages.
const ON_FLOOR: AppointmentStatus[] = [
  AppointmentStatus.CHECKED_IN,
  AppointmentStatus.IN_PROGRESS,
  AppointmentStatus.DRYING,
  AppointmentStatus.FINISHING,
  AppointmentStatus.COMPLETE,
];

/** What a pet-level alert says on the pet's own chip. */
const CHIP_FLAG_LABEL: Record<string, string> = {
  "no-groomer": "No groomer assigned",
  "waiting-unstarted": "Waiting 30+ min",
  overrunning: "Over booked time",
  "arrival-late": "Running late",
  "arrival-missed": "Treated as missed",
  "kennel-shortfall": "Needs a kennel, none free",
};

/** A pet waiting for its owner is only a flag once the wait is worth chasing. */
const PICKUP_SEVERITY: Record<PickupLevel, AlertSeverity | null> = {
  waiting: null,
  watch: "info",
  late: "warning",
  critical: "critical",
};


export default async function StaffDashboard(props: {
  searchParams: Promise<{ assigned?: string; error?: string }>;
}) {
  const searchParams = await props.searchParams;
  const now = new Date();
  const { start, end } = shopDayRange(now);

  const [
    todayAppointments,
    onFloor,
    pickups,
    stations,
    roster,
    alerts,
  ] = await Promise.all([
    prisma.appointment.findMany({
      where: { OR: [{ scheduledAt: { gte: start, lt: end } }, { status: { in: [...ON_FLOOR, AppointmentStatus.READY_PICKUP] } }] },
      select: {
        id: true,
        status: true,
        staffId: true,
        scheduledAt: true,
        needsKennel: true,
        durationMins: true,
        visitNotes: true,
        checkedInAt: true,
        completedAt: true,
        statusHistory: { select: { status: true, changedAt: true }, orderBy: { changedAt: "desc" } },
        stationId: true,
        kennelId: true,
        petId: true,
        kennel: { select: { label: true, station: { select: { name: true } } } },
        pet: {
          select: {
            name: true,
            hasBiteHistory: true,
            species: true,
            weightLbs: true,
            breed: true,
            dateOfBirth: true,
            photoId: true,
            photoUrl: true,
            healthFlags: true,
            temperamentNotes: true,
            vetName: true,
            vetPhone: true,
          },
        },
        customerId: true,
        customer: { select: { firstName: true, lastName: true, phone: true, smsOptOut: true, pricingNotes: true, alternateContacts: { select: { name: true }, orderBy: { createdAt: "asc" } } } },
        pricingTier: { select: { name: true } },
        pricingDiscountCents: true,
        services: { select: { sizeTier: true, serviceId: true, priceCents: true, service: { select: { name: true } } }, orderBy: { sortOrder: "asc" } },
      },
      orderBy: { scheduledAt: "asc" },
    }),
    prisma.appointment.findMany({
      where: { status: { in: ON_FLOOR } },
      select: { id: true, status: true, stationId: true },
    }),
    pickupWatchlist(),
    prisma.station.findMany({
      where: { isActive: true },
      orderBy: [{ role: "asc" }, { name: "asc" }],
      include: { kennels: { where: { isActive: true }, select: { appointments: { select: { customerId: true, pet: { select: { name: true } } } } } } },
    }),
    floorRoster(),
    serviceAlerts(),
  ]);

  // ── Today at a glance ─────────────────────────────────────────
  const scheduled = todayAppointments.filter((a) => a.status === AppointmentStatus.SCHEDULED);

  // What to ask for at the door. `checksForPets()` is two queries and returns
  // nothing at all when the gate is off or the shop checks nothing, so a shop
  // that asks for no certificates pays for an empty map.
  const config = await getConfig();
  const textsOn = isEnabled(config, "featureSmsNotify");
  // Today's close, from the hours the shop already published: a groom that runs past it is said at the desk.
  const todayHours = (config.businessHours as BusinessHours | null)?.[DAY_KEYS[shopDayIndex(now)]];
  const closesAt = todayHours ? shopMoment(shopDayKey(now), todayHours.close).getTime() : null;
  const [arrivalChecks, returning, lastRecords, unsigned, shifts, rewards, offers] = await Promise.all([
    checksForPets(scheduled.map((appointment) => appointment.petId), config),
    // Pets the shop has groomed before; everyone else is a first visit.
    prisma.appointment.groupBy({
      by: ["petId"],
      where: { petId: { in: scheduled.map((appointment) => appointment.petId) }, status: { in: FINISHED_STATUSES } },
    }),
    // "Same as last time?" is the counter's first question.
    lastGroomRecordsForPets(scheduled.map((appointment) => appointment.petId)),
    // Anything the owner has not signed can be signed at the counter, while they are standing there.
    outstandingDocumentsFor(scheduled.map((appointment) => appointment.customerId)),
    todaysShifts(now),
    // A reward waiting is handed over while the owner is at the desk; off, every card is empty.
    rewardCards(scheduled.map((appointment) => appointment.customerId)),
    // What the counter should mention about the services the visit booked.
    livePromotionsByService("staff", now),
  ]);
  const seenBefore = new Set(returning.map((row) => row.petId));
  // How long ago, beside what was done: a #7 blade six weeks back and six months back are different coats.
  const lastGroomByPet = new Map([...lastRecords].map(([petId, record]) =>
    [petId, `${groomRecordSummary(record)} · ${timeSince(record.completedAt ?? record.scheduledAt, now)}`]));
  // Empty doors, not room: a shared door may still take a household's dog.
  type Door = { appointments: { customerId: string; pet: { name: string } }[] };
  const emptyDoors = (doors: Door[]) => doors.filter((door) => door.appointments.length === 0).length;
  const kennelNote = (doors: Door[]) => {
    const empty = emptyDoors(doors);
    return doors.length ? { note: `${empty} of ${doors.length} doors empty`, tight: empty === 0 } : {};
  };
  // A kennel booking with no station yet points at the bank with the most empty doors.
  const roomiestBank = stations
    .filter((station) => station.role === "KENNEL" && emptyDoors(station.kennels) > 0)
    .sort((a, b) => emptyDoors(b.kennels) - emptyDoors(a.kennels))[0];
  // …unless a bank already holds this household behind one door: dogs from one home share on purpose.
  const bankValue = (bank?: { id: string }) => (bank ? `kennelbank:${bank.id}` : null);
  const householdBank = (customerId: string) => stations.find((station) => station.role === "KENNEL"
    && station.kennels.some((door) => door.appointments.length > 0 && door.appointments.every((pet) => pet.customerId === customerId)));
  // The number wanted when a groom stops being routine; it travels with the health flags.
  const vetFor = (pet: { healthFlags: string[]; vetName: string | null; vetPhone: string | null }) =>
    pet.healthFlags.length && (pet.vetName || pet.vetPhone) ? { name: pet.vetName, phone: pet.vetPhone } : null;
  // The pet's own standing notes, read out whenever somebody is about to handle it.
  const petNotes = (pet: { healthFlags: string[]; temperamentNotes: string | null }) => [
    ...pet.healthFlags.map((flag) => ({ label: flag, severity: "warning" as AlertSeverity })),
    ...(pet.temperamentNotes
      ? [{ label: `Temperament: ${pet.temperamentNotes}`, severity: "info" as AlertSeverity }]
      : []),
  ];
  // ── The board ─────────────────────────────────────────────────
  const workStations = stations.filter((s) => isWorkStation(s.role));

  /*
   * The board's chips: every pet actually in the shop, wherever it is standing.
   * Pets that have not arrived are not on it — there is nothing to place yet —
   * and a station that is full simply shows the pet that is holding it.
   */
  // Every alert that names a visit is carried on that visit's card, and only there.
  const flagsFor = (appointmentId: string) => alerts
    .filter((alert) => alert.appointmentIds?.includes(appointmentId))
    .map((alert) => ({ label: CHIP_FLAG_LABEL[alert.id] ?? alert.title, severity: alert.severity }));
  const stationsById = new Map(stations.map((station) => [station.id, station]));
  const pickupsById = new Map(pickups.pets.map((pet) => [pet.appointmentId, pet]));
  // A finished dog whose sibling is still being worked on is held back, and
  // its chip says who for — the owner is told when the last one is done.
  const heldFor = (appointment: { id: string; customerId: string }) => {
    const names = waitingOn(
      todayAppointments
        .filter((visit) => visit.customerId === appointment.customerId && visit.id !== appointment.id)
        .map((visit) => ({ status: visit.status, petName: visit.pet.name }))
    );
    return names.length ? `Waiting for ${joinPetNames(names).names}` : "Notify owner";
  };
  const boardPets = todayAppointments
    .filter((appointment) => boardColumnForVisit(appointment) !== null)
    .sort((a, b) => boardWaitingSince(a) - boardWaitingSince(b) || a.id.localeCompare(b.id))
    .map((appointment) => ({
      id: appointment.id,
      petName: appointment.pet.name,
      petPhotoUrl: photoUrl(appointment.pet.photoId) ?? appointment.pet.photoUrl,
      kennelName: appointment.kennel
        ? `${appointment.kennel.station.name} · ${appointment.kennel.label}`
        : null,
      ownerName: `${appointment.customer.firstName} ${appointment.customer.lastName}`,
      columnKey: boardColumnForVisit(appointment)?.key ?? BOARD_COLUMNS[0].key,
      stationName: appointment.stationId
        ? (stationsById.get(appointment.stationId)?.name ?? null)
        : null,
      hasBiteHistory: appointment.pet.hasBiteHistory,
      ...(() => {
        const flags = flagsFor(appointment.id);
        if (appointment.status === AppointmentStatus.CHECKED_IN && !appointment.kennelId && !appointment.stationId) return { flags, pickupNote: "Needs a station or kennel" };
        if (appointment.status === AppointmentStatus.COMPLETE) return { flags, pickupNote: heldFor(appointment) };
        const pickup = pickupsById.get(appointment.id);
        if (!pickup) return { flags, pickupNote: null };
        const label = `${PICKUP_LEVEL_LABEL[pickup.level]} · ${pickup.waitingMins} min`;
        const severity = PICKUP_SEVERITY[pickup.level];
        return severity
          ? { flags: [...flags, { label, severity }], pickupNote: null }
          : { flags, pickupNote: label };
      })(),
      checkInWarnings: petNotes(appointment.pet),
      vet: vetFor(appointment.pet),
    }));
  const waitingOnFloor = boardPets.filter((pet) => pet.columnKey === BOARD_COLUMNS[0].key);

  /*
   * How full each stage is. A column backed by stations reads "2/4"; a column
   * with none — the shop that dries on the groom table, or has not added a
   * drying station yet — is left out and its header just counts heads.
   */
  // A table or tub holds one pet, so one already on it is not a place to put another.
  const stationsInUse = new Set(onFloor.flatMap((visit) => visit.stationId ?? []));
  const boardCapacity: Record<string, ColumnCapacity> = {};
  for (const column of BOARD_COLUMNS) {
    if (!column.stationRole) continue;
    const ofRole = workStations.filter((station) => station.role === column.stationRole);
    if (ofRole.length === 0) continue;
    boardCapacity[column.key] = {
      used: boardPets.filter((pet) => pet.columnKey === column.key).length,
      capacity: ofRole.length,
    };
  }

  const onShift = roster.filter((member) => member.state !== "OFF_SHIFT");

  return (
    <PageShell
      className={styles.dashboard}
      title={formatShopDate(now, { weekday: "long", month: "long", day: "numeric" })}
      actions={<>
        <DashboardRefresh updatedAt={now.toISOString()} />
        <Link
          href="/staff/appointments"
          className="text-sm font-bold px-3 py-1.5 rounded-lg border border-stone-200 bg-white hover:bg-stone-50 transition-colors"
        >
          Full schedule
        </Link>
        <Link href="/staff/appointments/new" className="rounded-lg bg-brand-600 px-3 py-2 text-sm font-bold text-brand-on-600">+ Book appointment</Link>
      </>}
    >
      <div className={styles.body}>
        <div className={styles.metrics}>
          {[
            { label: "Arrivals left today", value: scheduled.length, hint: `${scheduled.filter((a) => a.scheduledAt < now).length} past arrival time`, tone: styles.blue, href: "#arrivals" },
            { label: "In service now", value: onFloor.filter((a) => a.status !== "COMPLETE").length, hint: `${onFloor.filter((a) => a.status === "CHECKED_IN").length} checked in, waiting to start`, tone: styles.amber, href: "/staff/stations" },
            { label: "Ready for pickup", value: pickups.pets.length, hint: `${pickups.pets.filter((pet) => ["late", "critical"].includes(pet.level)).length} late pickups`, tone: styles.green, href: "/staff/appointments?status=READY_PICKUP" },
            { label: "Team ready now", value: roster.filter((member) => member.state === "READY").length, hint: `${onShift.length} signed in · ${roster.filter((member) => member.state === "WORKING").length} working`, tone: styles.purple, href: "/staff/team" },
          ].map((metric) => <a key={metric.label} href={metric.href} className={`${styles.metric} ${metric.tone}`}><span>{metric.label}</span><strong>{metric.value}</strong><small>{metric.hint}</small></a>)}
        </div>
      {searchParams.assigned === "1" && (
        <p className="border-t border-stone-100 bg-green-50 px-3 py-2 text-green-800 text-sm font-medium">
          Assigned.
        </p>
      )}
      {searchParams.error === "suggestion_stale" && (
        <p className="border-t border-stone-100 bg-amber-50 px-3 py-2 text-amber-800 text-sm font-medium">
          The storefront moved before that could be applied — here is the current picture.
        </p>
      )}
      {searchParams.error === "not_floor_staff" && (
        <p className="border-t border-stone-100 bg-amber-50 px-3 py-2 text-amber-800 text-sm font-medium">
          Storefront status is for groomers and bathers — an admin-only account does not take pets.
        </p>
      )}
      {searchParams.error === "role_not_allowed" && (
        <p className="border-t border-stone-100 bg-red-50 px-3 py-2 text-red-800 text-sm font-medium">
          That station is limited to roles this person does not hold.
        </p>
      )}

        <div className={`${styles.panel} ${styles.lifecycle}`}>
            <PageSection
              title="Service lifecycle"
              actions={<span className={styles.floorCount}>{boardPets.length} {boardPets.length === 1 ? "pet" : "pets"} on the floor</span>}
              hint={
                <span>
                  {waitingOnFloor.length > 0 && (
                    <span className="font-bold text-amber-700">{waitingOnFloor.length} waiting · </span>
                  )}
                  From arrival to a happy homecoming
                </span>
              }
            >
              <FloorBoard assign={assignLifecycleDestination} closesAt={closesAt} destinations={[
                // A bank, not every door: the server takes the lowest door with
                // room for this pet, so the board stays a handful of targets.
                ...stations.filter((station) => station.role === "KENNEL").map((station) => ({
                  value: `kennelbank:${station.id}`, label: station.name, kind: "kennel" as const,
                  ...kennelNote(station.kennels),
                })),
                ...stations.filter((station) => station.role === "BATHING" || station.role === "GROOMER").map((station) => {
                  const on = todayAppointments.find((visit) => visit.stationId === station.id && ON_FLOOR.includes(visit.status));
                  // A table is the last stop, so the visit's booked end is when it frees; a bath frees sooner, so it says nothing.
                  // Rounded up to five minutes, the same as the dialog's "ready around", so two estimates never disagree by two.
                  const due = on && station.role === "GROOMER" && on.checkedInAt && on.durationMins
                    ? new Date(Math.ceil((on.checkedInAt.getTime() + on.durationMins * 60000) / 300000) * 300000) : null;
                  const freesAt = due && due > now ? due : null;
                  return {
                    value: `station:${station.id}`, label: station.name, kind: station.role === "BATHING" ? "bath" as const : "grooming" as const,
                    inUse: stationsInUse.has(station.id),
                    freesAt: freesAt?.getTime(),
                    // Who is on it, so the counter can say when it frees up; a free one names whose home it is,
                    // when they are in, so the dog goes to the person who will groom it.
                    note: on ? (freesAt ? `${on.pet.name} · done ~${formatShopTime(freesAt)}` : on.pet.name)
                      : roster.filter((member) => member.defaultStationId === station.id && member.state !== "OFF_SHIFT")
                        .map((member) => `${member.name}'s`).join(", ") || undefined,
                  };
                }),
              ]} arrivals={scheduled.map((appointment) => {
                const blockers = vaccinationBlockers(arrivalChecks.get(appointment.petId) ?? []);
                const flags = flagsFor(appointment.id);
                const tier = appointment.services.find((line) => line.sizeTier)?.sizeTier;
                const kin = householdBank(appointment.customerId);
                const kinNames = kin?.kennels.flatMap((door) => door.appointments
                  .filter((pet) => pet.customerId === appointment.customerId).map((pet) => pet.pet.name)) ?? [];
                const weighsAs = appointment.pet.weightLbs != null ? sizeForWeight(appointment.pet.weightLbs, sizeCutoffs(config)) : null;
                // The check-in dialog's list: only shots that are not current, then
                // the pet's own flags. A line saying all is well is one more to read past.
                const checkInWarnings = [
                  ...(arrivalChecks.get(appointment.petId) ?? [])
                    .filter((check) => check.level !== "current")
                    .map((check) => ({
                      label: `${check.name}: ${VACCINE_LEVEL_LABEL[check.level].toLowerCase()}${
                        check.expiresOn ? ` · ${formatShopDate(check.expiresOn)}` : ""
                      }`,
                      severity: (check.blocks ? "critical" : "warning") as AlertSeverity,
                    })),
                  ...petNotes(appointment.pet),
                  ...(unsigned.get(appointment.customerId) ?? []).map((document) => ({
                    label: `Not signed: ${document.title} v${document.version}`, severity: "warning" as AlertSeverity,
                  })),
                  // Whoever the booking went to is not in yet: the counter says so, or hands the dog to someone who is.
                  ...(() => {
                    const groomer = roster.find((member) => member.id === appointment.staffId);
                    return groomer?.state === "OFF_SHIFT"
                      ? [{ label: absenceNote(groomer.name, shifts.get(groomer.id), now), severity: "info" as AlertSeverity }] : [];
                  })(),
                  // The weight moved since the quote (or the cutoffs did): the price is a size out.
                  ...(tier && weighsAs && weighsAs !== tier
                    ? [{ label: `Weighs as ${sizeName(weighsAs)}, quoted as ${sizeName(tier)}: check the price`, severity: "warning" as AlertSeverity }]
                    : []),
                  // The ready-for-pickup call has nowhere to ring: the owner is at the desk, so ask now.
                  ...(!appointment.customer.phone?.trim()
                    ? [{ label: "No phone on file: take a number for the pickup call", severity: "info" as AlertSeverity }]
                    // The shop texts when a dog is ready, but this owner said STOP: somebody rings instead.
                    : textsOn && appointment.customer.smsOptOut
                      ? [{ label: "Opted out of texts: ring when ready", severity: "info" as AlertSeverity }]
                      : []),
                  // A dog is quoted at its weight; the door is where it gets one.
                  ...(appointment.pet.species === "DOG" && appointment.pet.weightLbs == null
                    ? [{ label: "No weight on record: weigh at check-in", severity: "info" as AlertSeverity }]
                    : []),
                ];
                if (blockers.length > 0) flags.unshift({ label: vaccinationRefusalMessage(blockers, appointment.pet.name), severity: "critical" });
                return {
                  id: appointment.id,
                  petName: appointment.pet.name,
                  ownerName: `${appointment.customer.firstName} ${appointment.customer.lastName}`,
                  arrivalTime: formatShopTime(appointment.scheduledAt),
                  scheduledAt: appointment.scheduledAt.getTime(),
                  assignedTo: roster.find((member) => member.id === appointment.staffId)?.name ?? "Unassigned",
                  flags,
                  hasBiteHistory: appointment.pet.hasBiteHistory,
                  firstVisit: !seenBefore.has(appointment.petId),
                  vet: vetFor(appointment.pet),
                  checkInWarnings,
                  needsKennel: appointment.needsKennel,
                  // An arriving pet waits in a kennel; the groomer's home station
                  // never decides where it goes. Household first, else the roomiest bank.
                  suggested: bankValue(kin ?? roomiestBank),
                  suggestedReason: kinNames.length ? `With ${kinNames.join(", ")}` : null,
                  petPhotoUrl: photoUrl(appointment.pet.photoId) ?? appointment.pet.photoUrl,
                  visitNotes: appointment.visitNotes,
                  ownerPhone: appointment.customer.phone,
                  alternates: appointment.customer.alternateContacts.map((contact) => contact.name),
                  breed: appointment.pet.breed,
                  // The rest of the household due today: one owner at the counter, several leads.
                  household: scheduled
                    .filter((other) => other.customerId === appointment.customerId && other.id !== appointment.id)
                    .map((other) => ({ id: other.id, name: other.pet.name })),
                  // Dogs from this home already in the building, and where: the owner at the desk asks after them.
                  inShop: todayAppointments
                    .filter((other) => other.customerId === appointment.customerId && boardColumnForVisit(other) !== null)
                    .map((other) => `${other.pet.name} at ${
                      (other.stationId && stationsById.get(other.stationId)?.name)
                      || (other.kennel && `${other.kennel.station.name} · ${other.kennel.label}`)
                      || boardColumnForVisit(other)!.label}`),
                  // The rate this visit was quoted at, and what the shop wrote about it.
                  rate: [appointment.pricingTier?.name, appointment.customer.pricingNotes?.trim()].filter(Boolean).join(" · "),
                  lastGroom: lastGroomByPet.get(appointment.petId),
                  // The quote read back with what it buys: net of the customer's rate, and only when every line was priced.
                  services: [
                    appointment.services.flatMap((line) => line.service?.name ?? []).join(", "),
                    appointment.services.length && appointment.services.every((line) => line.priceCents != null)
                      ? `${formatCents(Math.max(0, appointment.services.reduce((sum, line) => sum + (line.priceCents ?? 0), 0) - (appointment.pricingDiscountCents ?? 0)))} quoted`
                      : "",
                  ].filter(Boolean).join(" · "),
                  // Good news, not a warning: it sits with the offer, above the list of what to check.
                  reward: (() => {
                    const card = rewards.get(appointment.customerId);
                    return card?.available ? `${card.label}${card.available > 1 ? ` × ${card.available}` : ""}` : null;
                  })(),
                  offer: appointment.services.flatMap((line) => ((line.serviceId && offers.get(line.serviceId)) || [])
                    .map((promotion) => [promotion.title, promotion.code && `code ${promotion.code}`].filter(Boolean).join(", "))).join(" · ") || null,
                  bookedMins: appointment.durationMins,
                  // Which dog, then what it was priced as: the breed and age confirm the dog on the lead is the one
                  // booked, and a dog visibly not the quoted size beside the weight on file is repriced at the desk.
                  sizing: [
                    appointment.pet.breed?.trim(),
                    appointment.pet.dateOfBirth && petAge(appointment.pet.dateOfBirth, now),
                    tier && `Quoted as ${sizeName(tier)}`,
                    tier && appointment.pet.weightLbs != null && `${appointment.pet.weightLbs} lb on record`,
                  ].filter(Boolean).join(" · ") || null,
                  // Past the booked time but not yet late by the shop's own threshold.
                  note: appointment.scheduledAt < now && !flags.length ? "Past arrival time" : null,
                };
              })} pets={boardPets} capacity={boardCapacity} move={moveToColumn} />
            </PageSection>
        </div>
      </div>
    </PageShell>
  );
}

